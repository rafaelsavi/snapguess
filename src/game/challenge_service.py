"""Challenge mode orchestration service delegating scoring to GameMode engines."""

from __future__ import annotations

import random
from typing import Any

from fastapi import HTTPException

from src.app_logging import LOGGER_MATCH, get_logger
from src.config import AppSettings
from src.game.selector import calculate_match_bounds, generate_batch_pins, is_asset_valid_for_batch
from src.models import (
    AssetAnswer,
    BatchPhotoItem,
    BatchPinItem,
    BatchRevealItem,
    ChallengeAnswerRequest,
    ChallengeAnswerResponse,
    ChallengeCreateRequest,
    ChallengeQuestionResponse,
    GameMode,
    MapBounds,
    PinpointAnswerItem,
    PinpointDeviation,
    PinpointReveal,
    RoundLength,
)
from src.scoring import (
    apportion_unshuffle_photo_scores,
    batch_exponential_date_score,
    batch_exponential_location_score,
    calculate_date_decay,
    calculate_location_decay,
    date_diff_days,
    date_diff_months,
    date_diff_parts,
    haversine_km,
    pinpoint_date_score,
    pinpoint_location_score,
)
from src.storage.challenge import ChallengeStore
from src.storage.leaderboard import LeaderboardStore
from src.storage.metadata import AssetFilterCriteria, MetadataStore
from src.storage.session import RoundAsset

logger = get_logger(LOGGER_MATCH)


def select_diverse_challenge_assets(
    candidates: dict[str, AssetAnswer],
    count: int,
    location_mode: bool,
    date_mode: bool,
    *,
    preserve_order: bool = False,
) -> list[RoundAsset]:
    """Select count diverse assets from candidate pool with fallback."""
    candidate_ids = list(candidates.keys())
    if not preserve_order:
        random.shuffle(candidate_ids)

    selected: list[RoundAsset] = []
    # Primary pass: greedily pick diverse assets
    for aid in candidate_ids:
        ans = candidates[aid]
        if is_asset_valid_for_batch(
            ans,
            selected,
            location_mode=location_mode,
            date_mode=date_mode,
        ):
            selected.append(RoundAsset(asset_id=aid, answer=ans))
            if len(selected) == count:
                break

    # Fallback pass: fill remaining slots with distinct unplayed candidates
    if len(selected) < count:
        selected_ids = {ra.asset_id for ra in selected}
        for aid in candidate_ids:
            if aid not in selected_ids:
                selected.append(RoundAsset(asset_id=aid, answer=candidates[aid]))
                if len(selected) == count:
                    break

    return selected


def get_challenge_total_rounds(
    challenge_or_config: dict[str, Any],
    asset_ids: list[str] | None = None,
) -> int:
    """Calculate the total number of rounds for a challenge based on game mode and asset pool."""
    if 'config' in challenge_or_config and isinstance(challenge_or_config['config'], dict):
        config = challenge_or_config['config']
        assets = asset_ids if asset_ids is not None else challenge_or_config.get('asset_ids', [])
    else:
        config = challenge_or_config
        assets = asset_ids or []

    game_mode = config.get('game_mode', 'pinpoint')
    if str(game_mode).lower() in ('unshuffle', 'gamemode.unshuffle'):
        return len(config.get('round_batches', []))
    return len(assets)


class ChallengeService:
    """Orchestrates challenge creation, question delivery, and scoring.

    Delegates scoring to the same exponential decay functions used by local mode,
    using pre-computed decay constants frozen in config_json at creation time.
    """

    def __init__(
        self,
        challenge_store: ChallengeStore,
        metadata_store: MetadataStore,
        leaderboard_store: LeaderboardStore,
        settings: AppSettings,
    ) -> None:
        self.challenge_store = challenge_store
        self.metadata_store = metadata_store
        self.leaderboard_store = leaderboard_store
        self.settings = settings

    def create_challenge(
        self,
        setup: ChallengeCreateRequest,
        base_url: str,
    ) -> dict[str, Any]:
        """Create a deterministic challenge seed with frozen scoring parameters."""
        # Resolve human-readable album and person names if not already populated
        if setup.albums and not setup.album_names:
            album_names_map = self.metadata_store.get_album_names(setup.albums)
            setup.album_names = [album_names_map.get(aid, aid) for aid in setup.albums]
        if setup.people and not setup.person_names:
            person_names_map = self.metadata_store.get_person_names(setup.people)
            setup.person_names = [person_names_map.get(pid, pid) for pid in setup.people]

        criteria = AssetFilterCriteria.from_setup(setup, self.settings)
        game_mode = setup.game_mode

        # Determine required asset count
        batch_size = 3 if game_mode == GameMode.unshuffle else 1
        required = setup.round_count * batch_size

        candidates = self.metadata_store.fetch_candidate_assets(criteria, limit=max(250, required * 5))
        if len(candidates) < required:
            raise HTTPException(
                status_code=400,
                detail=f'Insufficient eligible photos. Found {len(candidates)}, need {required}.',
            )

        # Select diverse assets while preserving SQLite's least-played (times_played ASC, RANDOM()) priority
        selected = select_diverse_challenge_assets(
            candidates,
            required,
            location_mode=setup.location_mode,
            date_mode=setup.date_mode,
            preserve_order=True,
        )
        asset_ids = [ra.asset_id for ra in selected]

        # Pre-compute scoring decay constants from the selected pool and anti-spoiler map bounds from candidate pool
        location_decay_km = calculate_location_decay(selected) if setup.location_mode else None
        date_decay_days = calculate_date_decay(selected) if setup.date_mode else None
        map_bounds = (
            calculate_match_bounds(candidates) if (setup.location_mode and game_mode == GameMode.pinpoint) else None
        )

        # Build config_json with frozen scoring parameters
        config = setup.model_dump(mode='json')
        config['location_decay_km'] = location_decay_km
        config['date_decay_days'] = date_decay_days
        config['map_bounds'] = map_bounds.model_dump() if map_bounds else None

        # Generate filter summary for display and auto-title
        _, filter_summary = setup.format_filter_summary(language=self.settings.language)
        filter_tooltip = setup.format_filter_tooltip(language=self.settings.language)
        config['filter_summary'] = filter_summary
        config['filter_tooltip'] = filter_tooltip

        # Unshuffle: pre-assign batch groupings and randomized pins
        if game_mode == GameMode.unshuffle:
            round_batches = [list(range(i * batch_size, (i + 1) * batch_size)) for i in range(setup.round_count)]
            config['batch_size'] = batch_size
            config['round_batches'] = round_batches
            # Pre-generate pins for each round batch
            batch_pins: dict[str, list[dict[str, object]]] = {}
            for round_idx, indices in enumerate(round_batches):
                batch_assets = [selected[i] for i in indices]
                pins = generate_batch_pins(batch_assets, location_mode=setup.location_mode)
                batch_pins[str(round_idx)] = pins
            config['batch_pins'] = batch_pins

        # Auto-generate title if not provided
        title = setup.title
        if not title:
            title = f"{setup.creator_name}'s {filter_summary} Challenge"

        record = self.challenge_store.create_challenge(
            creator_name=setup.creator_name,
            libraries=list(setup.libraries) if setup.libraries else None,
            config=config,
            asset_ids=asset_ids,
            title=title,
            expires_in_hours=setup.expires_in_hours,
        )
        self.metadata_store.record_assets_played(asset_ids)

        play_url = f'{base_url.rstrip("/")}/play/{record["capability_token"]}'

        return {
            **record,
            'play_url': play_url,
            'title': title,
            'game_mode': game_mode.value,
            'rounds': setup.round_count,
        }

    def get_question(
        self,
        challenge: dict[str, Any],
        round_index: int,
    ) -> ChallengeQuestionResponse:
        """Build question payload for round N without exposing answer data."""
        config = challenge['config']
        asset_ids = challenge['asset_ids']
        game_mode = GameMode(config.get('game_mode', 'pinpoint'))

        if game_mode == GameMode.unshuffle:
            round_batches = config.get('round_batches', [])
            if round_index < 0 or round_index >= len(round_batches):
                raise HTTPException(status_code=400, detail='Invalid round index for unshuffle.')
            batch_indices = round_batches[round_index]
            batch_asset_ids = [asset_ids[i] for i in batch_indices]

            token = challenge['capability_token']
            batch_photos = [
                BatchPhotoItem(
                    photo_id=aid,
                    media_url=f'/play/media/{token}/{aid}',
                )
                for aid in batch_asset_ids
            ]

            raw_pins = config.get('batch_pins', {}).get(str(round_index), [])
            batch_pins = (
                [
                    BatchPinItem(
                        pin_id=str(p['pin_id']),
                        latitude=float(p['latitude']),
                        longitude=float(p['longitude']),
                    )
                    for p in raw_pins
                    if p.get('latitude') is not None and p.get('longitude') is not None
                ]
                if config.get('location_mode', True)
                else None
            )

            return ChallengeQuestionResponse(
                round_index=round_index,
                total_rounds=len(round_batches),
                asset_id=batch_asset_ids[0],
                media_url=f'/play/media/{token}/{batch_asset_ids[0]}',
                game_mode=game_mode,
                location_mode=bool(config.get('location_mode', True)),
                date_mode=bool(config.get('date_mode', True)),
                round_length=RoundLength(config.get('round_length', '1m')),
                map_bounds=MapBounds(**config['map_bounds']) if config.get('map_bounds') else None,
                batch_photos=batch_photos,
                batch_pins=batch_pins,
            )

        # Pinpoint: single photo
        if round_index < 0 or round_index >= len(asset_ids):
            raise HTTPException(status_code=400, detail='Invalid round index for pinpoint.')

        target_asset_id = asset_ids[round_index]
        token = challenge['capability_token']
        return ChallengeQuestionResponse(
            round_index=round_index,
            total_rounds=len(asset_ids),
            asset_id=target_asset_id,
            media_url=f'/play/media/{token}/{target_asset_id}',
            game_mode=game_mode,
            location_mode=bool(config.get('location_mode', True)),
            date_mode=bool(config.get('date_mode', True)),
            round_length=RoundLength(config.get('round_length', '1m')),
            map_bounds=MapBounds(**config['map_bounds']) if config.get('map_bounds') else None,
        )

    def score_and_persist_answer(
        self,
        challenge: dict[str, Any],
        session: dict[str, Any],
        body: ChallengeAnswerRequest,
    ) -> ChallengeAnswerResponse:
        """Score a round answer using frozen decay constants and persist to match_round_guesses.

        Returns the personal round reveal with actual answer data (server enforces
        Fog of War — this player only sees their own result).
        """
        config = challenge['config']
        asset_ids = challenge['asset_ids']
        game_mode = GameMode(config.get('game_mode', 'pinpoint'))
        location_mode = bool(config.get('location_mode', True))
        date_mode = bool(config.get('date_mode', True))

        # Frozen decay constants from creation time
        location_decay_km = config.get('location_decay_km')
        date_decay_days = config.get('date_decay_days')

        # Server-side timer grace window validation
        round_length = RoundLength(config.get('round_length', '1m'))
        max_seconds = round_length.seconds
        if max_seconds and body.time_taken_seconds > max_seconds + 5.0 and not body.timed_out:
            logger.warning(
                'Challenge %s: Player %r round %d exceeded timer (%.1fs > %ds + 5s grace)',
                challenge['challenge_id'],
                session['player_name'],
                body.round_index,
                body.time_taken_seconds,
                max_seconds,
            )
            body.timed_out = True

        if game_mode == GameMode.unshuffle:
            return self._score_unshuffle(
                challenge,
                session,
                body,
                config,
                asset_ids,
                location_mode,
                date_mode,
                location_decay_km,
                date_decay_days,
            )

        return self._score_pinpoint(
            challenge,
            session,
            body,
            config,
            asset_ids,
            location_mode,
            date_mode,
            location_decay_km,
            date_decay_days,
        )

    def _score_pinpoint(
        self,
        challenge: dict[str, Any],
        session: dict[str, Any],
        body: ChallengeAnswerRequest,
        config: dict[str, Any],
        asset_ids: list[str],
        location_mode: bool,
        date_mode: bool,
        location_decay_km: float | None,
        date_decay_days: float | None,
    ) -> ChallengeAnswerResponse:
        """Score a Pinpoint round using the same exponential decay as local mode."""
        if body.round_index < 0 or body.round_index >= len(asset_ids):
            raise HTTPException(status_code=400, detail='Invalid round index for pinpoint.')

        target_asset_id = asset_ids[body.round_index]
        asset = self.metadata_store.get_asset_answer(target_asset_id)
        if not asset:
            raise HTTPException(status_code=404, detail='Photo asset not found.')

        g = body.pinpoint or PinpointAnswerItem()

        # Location scoring: 100 * e^(-distance_km / decay_km)
        distance_km: float | None = None
        location_points: int = 0
        if (
            location_mode
            and location_decay_km
            and location_decay_km > 0
            and g.guessed_latitude is not None
            and g.guessed_longitude is not None
            and asset.latitude is not None
            and asset.longitude is not None
        ):
            distance_km = haversine_km(
                asset.latitude,
                asset.longitude,
                g.guessed_latitude,
                g.guessed_longitude,
            )
            location_points = pinpoint_location_score(distance_km, decay_km=location_decay_km)

        # Date scoring: 100 * e^(-date_diff_days / decay_days)
        delta_days: int | None = None
        delta_months: int | None = None
        years_part: int | None = None
        months_part: int | None = None
        days_part: int | None = None
        date_points: int = 0
        if (
            date_mode
            and date_decay_days
            and date_decay_days > 0
            and g.guessed_year is not None
            and g.guessed_month is not None
            and asset.capture_date is not None
        ):
            delta_days = date_diff_days(g.guessed_year, g.guessed_month, asset.capture_date)
            delta_months = date_diff_months(g.guessed_year, g.guessed_month, asset.capture_date)
            years_part, months_part, days_part = date_diff_parts(g.guessed_year, g.guessed_month, asset.capture_date)
            date_points = pinpoint_date_score(delta_days, decay_days=date_decay_days)

        round_score = location_points + date_points
        total_rounds = get_challenge_total_rounds(challenge)
        is_final = body.round_index >= total_rounds - 1

        # Persist round guess using existing leaderboard schema
        guess_date_str = (
            f'{g.guessed_year:04d}-{g.guessed_month:02d}-01'
            if g.guessed_year is not None and g.guessed_month is not None
            else None
        )
        self.leaderboard_store.record_challenge_round_guess(
            match_id=session['match_id'],
            challenge_id=challenge['challenge_id'],
            player_name=session['player_name'],
            round_index=body.round_index,
            photo_index=0,
            game_mode='pinpoint',
            asset_id=target_asset_id,
            guess_latitude=g.guessed_latitude,
            guess_longitude=g.guessed_longitude,
            actual_latitude=asset.latitude,
            actual_longitude=asset.longitude,
            actual_city=asset.city,
            actual_country=asset.country,
            distance_km=distance_km,
            location_points=location_points if location_mode else None,
            guess_date=guess_date_str,
            actual_date=asset.capture_date.isoformat() if asset.capture_date else None,
            date_diff_days=delta_days,
            date_points=date_points if date_mode else None,
            round_score=round_score,
            time_taken_seconds=body.time_taken_seconds,
            timed_out=body.timed_out,
        )

        self.leaderboard_store.record_match_round(
            match_id=session['match_id'],
            player_name=session['player_name'],
            round_index=body.round_index,
            game_mode='pinpoint',
            location_score=location_points if location_mode else None,
            date_score=date_points if date_mode else None,
            round_score=round_score,
            time_taken_seconds=body.time_taken_seconds,
            timed_out=body.timed_out,
        )

        # Advance session state
        advanced = self.challenge_store.advance_session(
            session['session_token'],
            round_index=body.round_index,
            location_points=location_points,
            date_points=date_points,
            round_score=round_score,
            time_taken_seconds=body.time_taken_seconds,
            is_final=is_final,
        )
        if not advanced:
            raise HTTPException(
                status_code=409,
                detail=f'Round {body.round_index} was already submitted or session has moved on.',
            )

        # Finalize match entry if last round
        if is_final:
            updated_session = self.challenge_store.get_player_session(session['session_token'])
            if updated_session:
                self._finalize_player_match(challenge, updated_session, total_rounds)

        updated = self.challenge_store.get_player_session(session['session_token'])

        token = challenge['capability_token']
        pinpoint_reveal = PinpointReveal(
            asset_id=target_asset_id,
            media_url=f'/play/media/{token}/{target_asset_id}',
            actual_latitude=asset.latitude,
            actual_longitude=asset.longitude,
            actual_date=asset.capture_date,
            actual_year=asset.capture_date.year if asset.capture_date else None,
            actual_month=asset.capture_date.month if asset.capture_date else None,
            actual_city=asset.city,
            actual_country=asset.country,
        )
        pinpoint_deviation = PinpointDeviation(
            distance_km=distance_km,
            date_diff_days=delta_days,
            date_diff_months=delta_months,
            date_diff_years_part=years_part,
            date_diff_months_part=months_part,
            date_diff_days_part=days_part,
        )

        return ChallengeAnswerResponse(
            round_index=body.round_index,
            round_score=round_score,
            location_score=location_points if location_mode else None,
            date_score=date_points if date_mode else None,
            pinpoint_reveal=pinpoint_reveal,
            pinpoint_deviation=pinpoint_deviation,
            batch_reveal=None,
            game_mode=GameMode.pinpoint,
            is_game_over=is_final,
            total_score=updated['total_score'] if updated else round_score,
            total_time_seconds=updated['total_time_seconds'] if updated else body.time_taken_seconds,
            timed_out=body.timed_out,
        )

    def _score_unshuffle(
        self,
        challenge: dict[str, Any],
        session: dict[str, Any],
        body: ChallengeAnswerRequest,
        config: dict[str, Any],
        asset_ids: list[str],
        location_mode: bool,
        date_mode: bool,
        location_decay_km: float | None,
        date_decay_days: float | None,
    ) -> ChallengeAnswerResponse:
        """Score an Unshuffle round using batch partial credit and frozen decay parameters."""
        total_rounds = get_challenge_total_rounds(challenge)
        if body.round_index < 0 or body.round_index >= total_rounds:
            raise HTTPException(status_code=400, detail='Invalid round index.')

        round_batches = config.get('round_batches', [])

        batch_indices = round_batches[body.round_index]
        batch_asset_ids = [asset_ids[i] for i in batch_indices]
        batch_assets: list[RoundAsset] = []
        for aid in batch_asset_ids:
            ans = self.metadata_store.get_asset_answer(aid)
            if not ans:
                raise HTTPException(status_code=404, detail=f'Photo asset {aid} not found.')
            batch_assets.append(RoundAsset(asset_id=aid, answer=ans))

        raw_pins = config.get('batch_pins', {}).get(str(body.round_index), [])
        answers = body.unshuffle or []
        assigned_pins = {ans.photo_id: ans.assigned_pin_id for ans in answers}
        assigned_timeline = {ans.photo_id: ans.assigned_timeline_index for ans in answers}

        true_pin_map = {str(bp['true_asset_id']): str(bp['pin_id']) for bp in raw_pins}
        pin_coords = {
            str(bp['pin_id']): (
                float(bp['latitude']) if bp.get('latitude') is not None else None,
                float(bp['longitude']) if bp.get('longitude') is not None else None,
            )
            for bp in raw_pins
        }
        photo_coords = {ba.asset_id: (ba.answer.latitude, ba.answer.longitude) for ba in batch_assets}
        photo_dates = {ba.asset_id: ba.answer.capture_date for ba in batch_assets}

        # Location scoring via batch exponential decay
        if location_mode and location_decay_km is not None and location_decay_km > 0:
            location_points, _, _ = batch_exponential_location_score(
                assigned_pins=assigned_pins,
                true_pin_map=true_pin_map,
                pin_coords=pin_coords,
                photo_coords=photo_coords,
                decay_km=location_decay_km,
            )
        else:
            location_points = 0

        # Date scoring via batch exponential decay
        if date_mode and date_decay_days is not None and date_decay_days > 0:
            date_points, _, _ = batch_exponential_date_score(
                assigned_timeline=assigned_timeline,
                photo_dates=photo_dates,
                decay_days=date_decay_days,
            )
        else:
            date_points = 0

        round_score = location_points + date_points
        is_final = body.round_index >= total_rounds - 1

        # Calculate per-photo breakdowns and persist to match_round_guesses
        breakdowns = apportion_unshuffle_photo_scores(
            batch_assets=batch_assets,
            pins=raw_pins,
            assigned_pins=assigned_pins,
            assigned_timeline=assigned_timeline,
            location_mode=location_mode,
            date_mode=date_mode,
            round_location_score=location_points,
            round_date_score=date_points,
            decay_km=location_decay_km,
            decay_days=date_decay_days,
        )

        for item in breakdowns:
            self.leaderboard_store.record_challenge_round_guess(
                match_id=session['match_id'],
                challenge_id=challenge['challenge_id'],
                player_name=session['player_name'],
                round_index=body.round_index,
                photo_index=item.photo_index,
                game_mode='unshuffle',
                asset_id=item.asset_id,
                guess_latitude=item.guess_latitude,
                guess_longitude=item.guess_longitude,
                actual_latitude=item.actual_latitude,
                actual_longitude=item.actual_longitude,
                actual_city=item.actual_city,
                actual_country=item.actual_country,
                distance_km=item.distance_km,
                location_points=item.location_points,
                guess_date=None,
                actual_date=item.actual_date,
                date_diff_days=item.diff_days,
                date_points=item.date_points,
                round_score=item.photo_score,
                is_correct_location=item.is_correct_location,
                is_correct_date_order=item.is_correct_date_order,
                time_taken_seconds=body.time_taken_seconds,
                timed_out=body.timed_out,
                assigned_pin_id=item.assigned_pin_id,
                assigned_timeline_index=item.assigned_timeline_index,
                true_pin_id=item.true_pin_id,
            )

        self.leaderboard_store.record_match_round(
            match_id=session['match_id'],
            player_name=session['player_name'],
            round_index=body.round_index,
            game_mode='unshuffle',
            location_score=location_points if location_mode else None,
            date_score=date_points if date_mode else None,
            round_score=round_score,
            time_taken_seconds=body.time_taken_seconds,
            timed_out=body.timed_out,
        )

        # Advance session state
        advanced = self.challenge_store.advance_session(
            session['session_token'],
            round_index=body.round_index,
            location_points=location_points,
            date_points=date_points,
            round_score=round_score,
            time_taken_seconds=body.time_taken_seconds,
            is_final=is_final,
        )
        if not advanced:
            raise HTTPException(
                status_code=409,
                detail=f'Round {body.round_index} was already submitted or session has moved on.',
            )

        # Finalize match entry if last round
        if is_final:
            updated_session = self.challenge_store.get_player_session(session['session_token'])
            if updated_session:
                self._finalize_player_match(challenge, updated_session, total_rounds)

        updated = self.challenge_store.get_player_session(session['session_token'])

        batch_reveal = [
            BatchRevealItem(
                photo_id=ba.asset_id,
                true_pin_id=true_pin_map.get(ba.asset_id),
                actual_latitude=ba.answer.latitude,
                actual_longitude=ba.answer.longitude,
                actual_date=ba.answer.capture_date,
                actual_year=ba.answer.capture_date.year if ba.answer.capture_date else None,
                actual_month=ba.answer.capture_date.month if ba.answer.capture_date else None,
                actual_city=ba.answer.city,
                actual_country=ba.answer.country,
            )
            for ba in batch_assets
        ]

        return ChallengeAnswerResponse(
            round_index=body.round_index,
            round_score=round_score,
            location_score=location_points if location_mode else None,
            date_score=date_points if date_mode else None,
            game_mode=GameMode.unshuffle,
            batch_reveal=batch_reveal,
            is_game_over=is_final,
            total_score=updated['total_score'] if updated else round_score,
            total_time_seconds=updated['total_time_seconds'] if updated else body.time_taken_seconds,
            timed_out=body.timed_out,
        )

    def _finalize_player_match(
        self,
        challenge: dict[str, Any],
        session: dict[str, Any],
        total_rounds: int,
    ) -> None:
        """Create match and match_entry records when a player finishes all rounds."""
        config = challenge['config']
        self.leaderboard_store.finalize_challenge_player_match(
            match_id=session['match_id'],
            challenge_id=challenge['challenge_id'],
            config=config,
            player_name=session['player_name'],
            location_score=session.get('location_score', 0),
            date_score=session.get('date_score', 0),
            total_score=session['total_score'],
            total_rounds=total_rounds,
            total_time_seconds=session['total_time_seconds'],
            libraries=challenge.get('libraries'),
        )
        logger.info(
            '🏁 Challenge %s: Player %r finished (score=%d, time=%.1fs)',
            challenge['challenge_id'],
            session['player_name'],
            session['total_score'],
            session['total_time_seconds'],
        )
