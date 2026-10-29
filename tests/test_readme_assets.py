"""Regression tests verifying that all images and animated GIFs referenced in README.md exist and are valid."""

from __future__ import annotations

import re
from pathlib import Path

from PIL import Image

REPO_ROOT = Path(__file__).resolve().parents[1]
README_PATH = REPO_ROOT / 'README.md'


def extract_local_image_paths(markdown_text: str) -> list[str]:
    """Extract all local (non-HTTP) image source paths from Markdown and HTML <img> tags."""
    md_imgs = re.findall(r'!\[[^\]]*\]\(([^)]+)\)', markdown_text)
    html_imgs = re.findall(r'<img\s+[^>]*src=["\']([^"\']+)["\']', markdown_text, flags=re.IGNORECASE)
    all_srcs = md_imgs + html_imgs
    local_srcs = [src.strip() for src in all_srcs if not src.strip().startswith(('http://', 'https://', 'data:'))]
    return list(dict.fromkeys(local_srcs))


def test_readme_has_gameplay_gif_and_screenshots() -> None:
    """Verify README.md references the gameplay GIF and screenshots and all image files are valid."""
    assert README_PATH.is_file(), 'README.md must exist at repository root'
    content = README_PATH.read_text(encoding='utf-8')

    local_images = extract_local_image_paths(content)
    expected_assets = {
        'docs/assets/gameplay.gif',
        'docs/assets/home.webp',
        'docs/assets/gameplay_pinpoint.webp',
        'docs/assets/round_reveal.webp',
        'docs/assets/summary_podium.webp',
    }
    assert expected_assets.issubset(set(local_images)), (
        f'Expected README.md to reference {expected_assets}, found {local_images}'
    )

    for rel_path in local_images:
        img_path = REPO_ROOT / rel_path
        assert img_path.is_file(), f'Referenced README image does not exist: {rel_path}'
        assert img_path.stat().st_size > 1024, f'Referenced README image is unexpectedly small/empty: {rel_path}'

        with Image.open(img_path) as img:
            width, height = img.size
            assert width >= 600 and height >= 400, (
                f'Image {rel_path} has unexpectedly small dimensions: {width}x{height}'
            )
            if rel_path.endswith('.gif'):
                n_frames = getattr(img, 'n_frames', 1)
                assert n_frames >= 5, f'Expected animated GIF {rel_path} to have >= 5 frames, got {n_frames}'
