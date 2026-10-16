"""Local filesystem photo provider scanning directories and parsing EXIF headers."""

from __future__ import annotations

import asyncio
import io
import os
import re
from collections.abc import Mapping
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import reverse_geocoder as rg
from PIL import ExifTags, Image, ImageOps

try:
    import pillow_heif

    pillow_heif.register_heif_opener()
except ImportError:
    pass

from src.app_logging import LOGGER_SYNC, get_logger
from src.providers.base import BasePhotoProvider, ProviderError

logger = get_logger(LOGGER_SYNC)

SUPPORTED_EXTENSIONS = frozenset({'.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif', '.avif', '.heic', '.heif'})

# Comprehensive ISO 3166-1 alpha-2 code to full country/territory name lookup
ISO_3166_COUNTRIES: dict[str, str] = {
    'AD': 'Andorra',
    'AE': 'United Arab Emirates',
    'AF': 'Afghanistan',
    'AG': 'Antigua and Barbuda',
    'AI': 'Anguilla',
    'AL': 'Albania',
    'AM': 'Armenia',
    'AO': 'Angola',
    'AQ': 'Antarctica',
    'AR': 'Argentina',
    'AS': 'American Samoa',
    'AT': 'Austria',
    'AU': 'Australia',
    'AW': 'Aruba',
    'AX': 'Aland Islands',
    'AZ': 'Azerbaijan',
    'BA': 'Bosnia and Herzegovina',
    'BB': 'Barbados',
    'BD': 'Bangladesh',
    'BE': 'Belgium',
    'BF': 'Burkina Faso',
    'BG': 'Bulgaria',
    'BH': 'Bahrain',
    'BI': 'Burundi',
    'BJ': 'Benin',
    'BL': 'Saint Barthelemy',
    'BM': 'Bermuda',
    'BN': 'Brunei',
    'BO': 'Bolivia',
    'BQ': 'Bonaire, Sint Eustatius and Saba',
    'BR': 'Brazil',
    'BS': 'Bahamas',
    'BT': 'Bhutan',
    'BW': 'Botswana',
    'BY': 'Belarus',
    'BZ': 'Belize',
    'CA': 'Canada',
    'CC': 'Cocos (Keeling) Islands',
    'CD': 'Democratic Republic of the Congo',
    'CF': 'Central African Republic',
    'CG': 'Republic of the Congo',
    'CH': 'Switzerland',
    'CI': 'Ivory Coast',
    'CK': 'Cook Islands',
    'CL': 'Chile',
    'CM': 'Cameroon',
    'CN': 'China',
    'CO': 'Colombia',
    'CR': 'Costa Rica',
    'CU': 'Cuba',
    'CV': 'Cabo Verde',
    'CW': 'Curacao',
    'CX': 'Christmas Island',
    'CY': 'Cyprus',
    'CZ': 'Czech Republic',
    'DE': 'Germany',
    'DJ': 'Djibouti',
    'DK': 'Denmark',
    'DM': 'Dominica',
    'DO': 'Dominican Republic',
    'DZ': 'Algeria',
    'EC': 'Ecuador',
    'EE': 'Estonia',
    'EG': 'Egypt',
    'EH': 'Western Sahara',
    'ER': 'Eritrea',
    'ES': 'Spain',
    'ET': 'Ethiopia',
    'FI': 'Finland',
    'FJ': 'Fiji',
    'FK': 'Falkland Islands',
    'FM': 'Micronesia',
    'FO': 'Faroe Islands',
    'FR': 'France',
    'GA': 'Gabon',
    'GB': 'United Kingdom',
    'GD': 'Grenada',
    'GE': 'Georgia',
    'GF': 'French Guiana',
    'GG': 'Guernsey',
    'GH': 'Ghana',
    'GI': 'Gibraltar',
    'GL': 'Greenland',
    'GM': 'Gambia',
    'GN': 'Guinea',
    'GP': 'Guadeloupe',
    'GQ': 'Equatorial Guinea',
    'GR': 'Greece',
    'GS': 'South Georgia and South Sandwich Islands',
    'GT': 'Guatemala',
    'GU': 'Guam',
    'GW': 'Guinea-Bissau',
    'GY': 'Guyana',
    'HK': 'Hong Kong',
    'HN': 'Honduras',
    'HR': 'Croatia',
    'HT': 'Haiti',
    'HU': 'Hungary',
    'ID': 'Indonesia',
    'IE': 'Ireland',
    'IL': 'Israel',
    'IM': 'Isle of Man',
    'IN': 'India',
    'IO': 'British Indian Ocean Territory',
    'IQ': 'Iraq',
    'IR': 'Iran',
    'IS': 'Iceland',
    'IT': 'Italy',
    'JE': 'Jersey',
    'JM': 'Jamaica',
    'JO': 'Jordan',
    'JP': 'Japan',
    'KE': 'Kenya',
    'KG': 'Kyrgyzstan',
    'KH': 'Cambodia',
    'KI': 'Kiribati',
    'KM': 'Comoros',
    'KN': 'Saint Kitts and Nevis',
    'KP': 'North Korea',
    'KR': 'South Korea',
    'KW': 'Kuwait',
    'KY': 'Cayman Islands',
    'KZ': 'Kazakhstan',
    'LA': 'Laos',
    'LB': 'Lebanon',
    'LC': 'Saint Lucia',
    'LI': 'Liechtenstein',
    'LK': 'Sri Lanka',
    'LR': 'Liberia',
    'LS': 'Lesotho',
    'LT': 'Lithuania',
    'LU': 'Luxembourg',
    'LV': 'Latvia',
    'LY': 'Libya',
    'MA': 'Morocco',
    'MC': 'Monaco',
    'MD': 'Moldova',
    'ME': 'Montenegro',
    'MF': 'Saint Martin',
    'MG': 'Madagascar',
    'MH': 'Marshall Islands',
    'MK': 'North Macedonia',
    'ML': 'Mali',
    'MM': 'Myanmar',
    'MN': 'Mongolia',
    'MO': 'Macao',
    'MP': 'Northern Mariana Islands',
    'MQ': 'Martinique',
    'MR': 'Mauritania',
    'MS': 'Montserrat',
    'MT': 'Malta',
    'MU': 'Mauritius',
    'MV': 'Maldives',
    'MW': 'Malawi',
    'MX': 'Mexico',
    'MY': 'Malaysia',
    'MZ': 'Mozambique',
    'NA': 'Namibia',
    'NC': 'New Caledonia',
    'NE': 'Niger',
    'NF': 'Norfolk Island',
    'NG': 'Nigeria',
    'NI': 'Nicaragua',
    'NL': 'Netherlands',
    'NO': 'Norway',
    'NP': 'Nepal',
    'NR': 'Nauru',
    'NU': 'Niue',
    'NZ': 'New Zealand',
    'OM': 'Oman',
    'PA': 'Panama',
    'PE': 'Peru',
    'PF': 'French Polynesia',
    'PG': 'Papua New Guinea',
    'PH': 'Philippines',
    'PK': 'Pakistan',
    'PL': 'Poland',
    'PM': 'Saint Pierre and Miquelon',
    'PN': 'Pitcairn',
    'PR': 'Puerto Rico',
    'PS': 'Palestine',
    'PT': 'Portugal',
    'PW': 'Palau',
    'PY': 'Paraguay',
    'QA': 'Qatar',
    'RE': 'Reunion',
    'RO': 'Romania',
    'RS': 'Serbia',
    'RU': 'Russia',
    'RW': 'Rwanda',
    'SA': 'Saudi Arabia',
    'SB': 'Solomon Islands',
    'SC': 'Seychelles',
    'SD': 'Sudan',
    'SE': 'Sweden',
    'SG': 'Singapore',
    'SH': 'Saint Helena',
    'SI': 'Slovenia',
    'SJ': 'Svalbard and Jan Mayen',
    'SK': 'Slovakia',
    'SL': 'Sierra Leone',
    'SM': 'San Marino',
    'SN': 'Senegal',
    'SO': 'Somalia',
    'SR': 'Suriname',
    'SS': 'South Sudan',
    'ST': 'Sao Tome and Principe',
    'SV': 'El Salvador',
    'SX': 'Sint Maarten',
    'SY': 'Syria',
    'SZ': 'Eswatini',
    'TC': 'Turks and Caicos Islands',
    'TD': 'Chad',
    'TF': 'French Southern Territories',
    'TG': 'Togo',
    'TH': 'Thailand',
    'TJ': 'Tajikistan',
    'TK': 'Tokelau',
    'TL': 'Timor-Leste',
    'TM': 'Turkmenistan',
    'TN': 'Tunisia',
    'TO': 'Tonga',
    'TR': 'Turkey',
    'TT': 'Trinidad and Tobago',
    'TV': 'Tuvalu',
    'TW': 'Taiwan',
    'TZ': 'Tanzania',
    'UA': 'Ukraine',
    'UG': 'Uganda',
    'UM': 'United States Minor Outlying Islands',
    'US': 'United States',
    'UY': 'Uruguay',
    'UZ': 'Uzbekistan',
    'VA': 'Vatican City',
    'VC': 'Saint Vincent and the Grenadines',
    'VE': 'Venezuela',
    'VG': 'British Virgin Islands',
    'VI': 'U.S. Virgin Islands',
    'VN': 'Vietnam',
    'VU': 'Vanuatu',
    'WF': 'Wallis and Futuna',
    'WS': 'Samoa',
    'XK': 'Kosovo',
    'YE': 'Yemen',
    'YT': 'Mayotte',
    'ZA': 'South Africa',
    'ZM': 'Zambia',
    'ZW': 'Zimbabwe',
}

_GEOCODER: rg.RGeocoder | None = None


def _get_geocoder() -> rg.RGeocoder:
    """Return lazy-loaded singleton RGeocoder running in single-process quiet mode."""
    global _GEOCODER
    if _GEOCODER is None:
        _GEOCODER = rg.RGeocoder(mode=1, verbose=False)
    return _GEOCODER


def _convert_dms_to_dd(dms: Any, ref: Any) -> float | None:
    """Convert EXIF degrees/minutes/seconds coordinate tuple to signed decimal degrees."""
    if not dms or len(dms) < 3:
        return None
    try:

        def _to_float(val: Any) -> float:
            if hasattr(val, 'numerator') and hasattr(val, 'denominator'):
                den = float(val.denominator)
                return float(val.numerator) / den if den != 0 else 0.0
            if isinstance(val, (tuple, list)) and len(val) >= 2:
                num, den = float(val[0]), float(val[1])
                return num / den if den != 0 else 0.0
            return float(val)

        deg = _to_float(dms[0])
        minutes = _to_float(dms[1])
        seconds = _to_float(dms[2])
        dd = deg + (minutes / 60.0) + (seconds / 3600.0)

        if isinstance(ref, bytes):
            ref_str = ref.decode('ascii', errors='ignore').strip().upper()
        else:
            ref_str = str(ref or '').strip().upper()

        if ref_str in ('S', 'W'):
            dd = -dd
        if abs(dd) > 180.0:
            return None
        return round(dd, 7)
    except (TypeError, ValueError, ZeroDivisionError, AttributeError):
        return None


def _parse_exif_datetime(raw: Any) -> str | None:
    """Parse EXIF timestamp string (e.g. 'YYYY:MM:DD HH:MM:SS') into ISO 8601 UTC string."""
    if isinstance(raw, bytes):
        try:
            raw = raw.decode('ascii', errors='ignore')
        except Exception:
            return None
    if not raw or not isinstance(raw, str):
        return None
    cleaned = raw.strip()
    # Match standard EXIF format '2023:07:15 14:30:00' or ISO '2023-07-15 14:30:00'
    m = re.match(r'^(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})', cleaned)
    if m:
        y, mo, d, h, mi, s = m.groups()
        # Sanity check: reject uninitialized/corrupt dates (e.g. 0000:00:00 00:00:00)
        if int(y) >= 1970 and 1 <= int(mo) <= 12 and 1 <= int(d) <= 31:
            return f'{y}-{mo}-{d}T{h}:{mi}:{s}Z'
    return None


class LocalFolderPhotoProvider(BasePhotoProvider):
    """Local filesystem photo provider satisfying the BasePhotoProvider interface."""

    def __init__(self, libraries: Mapping[str, str | Path]) -> None:
        """Initialize provider with library names mapped to directory paths."""
        self._libraries: dict[str, Path] = {
            name.strip(): Path(path).expanduser().resolve() for name, path in libraries.items() if name.strip()
        }

    @property
    def provider_id(self) -> str:
        """Unique identifier for this provider."""
        return 'local'

    def list_libraries(self) -> list[str]:
        """Return list of configured library names."""
        return sorted(self._libraries.keys())

    def get_library_path(self, library_name: str) -> Path:
        """Return the root path for a given library or raise ProviderError."""
        if library_name not in self._libraries:
            raise ProviderError(f'Unknown library: {library_name}')
        return self._libraries[library_name]

    async def validate_access(self, library_name: str) -> None:
        """Validate that the library directory exists, is a directory, and is readable."""
        if library_name not in self._libraries:
            raise ProviderError(f'Unknown library: {library_name}')
        path = self._libraries[library_name]
        if not path.exists():
            raise ProviderError(f"Directory for library '{library_name}' does not exist: {path}")
        if not path.is_dir():
            raise ProviderError(f"Path for library '{library_name}' is not a directory: {path}")

        def _check_readable() -> None:
            try:
                next(os.scandir(path), None)
            except Exception as exc:
                raise ProviderError(f"Cannot read directory for library '{library_name}': {exc}") from exc

        await asyncio.to_thread(_check_readable)

    def resolve_asset_path(self, library_name: str, asset_id: str) -> Path:
        """Resolve a reversible hex asset ID to its absolute filesystem path."""
        root = self.get_library_path(library_name)
        try:
            rel_str = bytes.fromhex(asset_id).decode('utf-8')
        except Exception as exc:
            raise ProviderError(f'Invalid asset ID format: {asset_id}') from exc

        # Defense-in-depth: Reject absolute paths, Windows drive letters/streams, or traversal tokens
        if (
            Path(rel_str).is_absolute()
            or rel_str.startswith(('/', '\\'))
            or '..' in rel_str.replace('\\', '/').split('/')
            or ':' in rel_str
        ):
            raise ProviderError('Path traversal detected')

        full_path = (root / rel_str).resolve()
        if not full_path.is_relative_to(root):
            raise ProviderError('Path traversal detected')
        if not full_path.is_file():
            raise ProviderError(f'Asset file not found on disk: {asset_id}')
        return full_path

    async def get_asset_bytes(self, library_name: str, asset_id: str) -> tuple[bytes, str]:
        """Generate on-demand 1280px preview thumbnail with EXIF/GPS metadata scrubbed."""
        full_path = self.resolve_asset_path(library_name, asset_id)

        def _generate() -> tuple[bytes, str]:
            try:
                with Image.open(full_path) as raw_img:
                    try:
                        img = ImageOps.exif_transpose(raw_img)
                    except Exception:
                        img = raw_img
                    img.thumbnail((1280, 1280), Image.Resampling.LANCZOS)
                    # Handle transparency cleanly by compositing on white background
                    if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
                        rgba = img.convert('RGBA')
                        bg = Image.new('RGB', rgba.size, (255, 255, 255))
                        bg.paste(rgba, mask=rgba.split()[3])
                        img = bg
                    elif img.mode != 'RGB':
                        img = img.convert('RGB')
                    buf = io.BytesIO()
                    img.save(buf, format='JPEG', quality=82, optimize=True)
                    return buf.getvalue(), 'image/jpeg'
            except Exception as exc:
                raise ProviderError(f'Failed to render thumbnail for {full_path.name}: {exc}') from exc

        return await asyncio.to_thread(_generate)

    async def aclose(self) -> None:
        """Release any underlying resources on shutdown."""
        pass

    @staticmethod
    def extract_file_metadata(file_path: Path) -> dict[str, Any]:
        """Extract capture date and GPS coordinates from image EXIF header without decoding pixels."""
        lat: float | None = None
        lon: float | None = None
        capture_dt: str | None = None

        try:
            with Image.open(file_path) as img:
                exif = img.getexif()
                if exif:
                    # 1. Capture date: Check DateTimeOriginal, DateTimeDigitized, and DateTime
                    dt_raw = (
                        exif.get(ExifTags.Base.DateTimeOriginal)
                        or exif.get(ExifTags.Base.DateTimeDigitized)
                        or exif.get(ExifTags.Base.DateTime)
                    )
                    if not dt_raw:
                        # Some cameras put DateTime tags in the EXIF IFD
                        exif_ifd = exif.get_ifd(ExifTags.IFD.Exif)
                        dt_raw = (
                            exif_ifd.get(ExifTags.Base.DateTimeOriginal)
                            or exif_ifd.get(ExifTags.Base.DateTimeDigitized)
                            or exif_ifd.get(ExifTags.Base.DateTime)
                        )
                    capture_dt = _parse_exif_datetime(dt_raw)

                    # 2. GPS coordinates
                    gps_ifd = exif.get_ifd(ExifTags.IFD.GPSInfo)
                    if not gps_ifd:
                        raw_gps = exif.get(ExifTags.Base.GPSInfo)
                        if isinstance(raw_gps, dict):
                            gps_ifd = raw_gps

                    if gps_ifd:
                        raw_lat = gps_ifd.get(ExifTags.GPS.GPSLatitude)
                        raw_lat_ref = gps_ifd.get(ExifTags.GPS.GPSLatitudeRef, 'N')
                        raw_lon = gps_ifd.get(ExifTags.GPS.GPSLongitude)
                        raw_lon_ref = gps_ifd.get(ExifTags.GPS.GPSLongitudeRef, 'E')

                        if raw_lat and raw_lon:
                            lat = _convert_dms_to_dd(raw_lat, raw_lat_ref)
                            lon = _convert_dms_to_dd(raw_lon, raw_lon_ref)
                            # Exclude out-of-range coordinates or Null Island (0, 0)
                            if (
                                lat is not None
                                and lon is not None
                                and (abs(lat) > 90.0 or abs(lon) > 180.0 or (abs(lat) < 1e-6 and abs(lon) < 1e-6))
                            ):
                                lat = None
                                lon = None
        except Exception as exc:
            logger.debug('Skipping unreadable EXIF for %s: %s', file_path.name, exc)

        # Fallback date to filesystem mtime if EXIF date is missing
        if not capture_dt:
            try:
                mtime = file_path.stat().st_mtime
                capture_dt = datetime.fromtimestamp(mtime, tz=UTC).strftime('%Y-%m-%dT%H:%M:%SZ')
            except Exception:
                pass

        return {
            'latitude': lat,
            'longitude': lon,
            'capture_datetime': capture_dt,
        }

    def scan_library_files(
        self,
        library_name: str,
        cached_mtimes: dict[str, str],
        *,
        is_delta: bool = False,
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[tuple[str, str]], set[str]]:
        """Scan directory tree, extract EXIF, and resolve reverse-geocoding.

        Returns:
            (asset_dicts, albums_data, asset_albums, all_seen_asset_ids)

        """
        root = self.get_library_path(library_name)
        if not root.is_dir():
            raise ProviderError(f"Directory for library '{library_name}' does not exist or is not a directory: {root}")

        all_seen_ids: set[str] = set()
        albums_map: dict[str, str] = {}  # album_id -> album_name
        asset_albums: list[tuple[str, str]] = []
        pending_exif_files: list[tuple[str, Path, str, str | None]] = []  # (aid, path, mtime_str, album_id)
        asset_dicts: list[dict[str, Any]] = []

        system_dir_names = frozenset(
            {
                '@eaDir',
                '#recycle',
                '$RECYCLE.BIN',
                '__MACOSX',
                '.thumbnails',
                '.git',
                '.stversions',
            }
        )

        # 1. Walk directory tree
        for dirpath, dirnames, filenames in os.walk(root):
            # Prune hidden or system directories in-place to avoid unnecessary traversal
            dirnames[:] = [d for d in dirnames if not d.startswith('.') and d not in system_dir_names]

            p_dir = Path(dirpath)
            rel_dir = p_dir.relative_to(root).as_posix()
            album_id: str | None = None
            if rel_dir != '.':
                album_id = rel_dir.encode('utf-8').hex()
                album_name = rel_dir.replace('/', ' / ')
                albums_map[album_id] = album_name

            for fname in filenames:
                # Ignore hidden files, system files, and macOS AppleDouble files
                if fname.startswith('.'):
                    continue

                ext = os.path.splitext(fname)[1].lower()
                if ext not in SUPPORTED_EXTENSIONS:
                    continue

                full_path = p_dir / fname
                try:
                    st = full_path.stat()
                except OSError:
                    continue

                rel_file = full_path.relative_to(root).as_posix()
                aid = rel_file.encode('utf-8').hex()
                all_seen_ids.add(aid)

                mtime_str = f'mtime:{st.st_mtime_ns}'

                # Check if file is already indexed and unchanged in delta sync
                if is_delta and cached_mtimes.get(aid) == mtime_str:
                    # File unchanged; skip opening file for EXIF parsing
                    if album_id:
                        asset_albums.append((aid, album_id))
                    continue

                if album_id:
                    asset_albums.append((aid, album_id))
                pending_exif_files.append((aid, full_path, mtime_str, album_id))

        if not pending_exif_files:
            albums_data = [{'id': aid, 'name': aname, 'isShared': 0} for aid, aname in albums_map.items()]
            return asset_dicts, albums_data, asset_albums, all_seen_ids

        # 2. Extract EXIF for newly discovered or modified files
        coords_to_query: list[tuple[float, float]] = []
        parsed_entries: list[dict[str, Any]] = []

        for aid, fpath, mtime_str, _ in pending_exif_files:
            meta = self.extract_file_metadata(fpath)
            lat = meta['latitude']
            lon = meta['longitude']
            cap_dt = meta['capture_datetime']

            entry: dict[str, Any] = {
                'id': aid,
                'library_name': library_name,
                'is_shared': 0,
                'is_partner': 0,
                'file_type': 'IMAGE',
                'latitude': lat,
                'longitude': lon,
                'country': None,
                'state': None,
                'city': None,
                'capture_datetime': cap_dt,
                'immich_updated_at': mtime_str,
            }
            if lat is not None and lon is not None:
                coords_to_query.append((lat, lon))
            parsed_entries.append(entry)

        # 3. Batch offline reverse-geocoding via singleton RGeocoder
        if coords_to_query:
            try:
                geocoder = _get_geocoder()
                geo_results = geocoder.query(coords_to_query)
                geo_idx = 0
                for entry in parsed_entries:
                    if entry['latitude'] is not None and entry['longitude'] is not None and geo_idx < len(geo_results):
                        res = geo_results[geo_idx]
                        geo_idx += 1
                        cc = str(res.get('cc', '')).upper()
                        country_name = ISO_3166_COUNTRIES.get(cc, cc) if cc else None
                        entry['city'] = res.get('name') or None
                        entry['state'] = res.get('admin1') or None
                        entry['country'] = country_name
            except Exception as exc:
                logger.warning('Failed to reverse-geocode coordinates: %s', exc)

        asset_dicts.extend(parsed_entries)
        albums_data = [{'id': alb_id, 'name': aname, 'isShared': 0} for alb_id, aname in albums_map.items()]
        return asset_dicts, albums_data, asset_albums, all_seen_ids
