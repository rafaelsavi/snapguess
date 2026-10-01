"""Responsive city country subtitles and dropdown overflow behavior."""

from __future__ import annotations

from playwright.async_api import Page, expect


async def test_city_filter_uses_iso_codes_when_narrow(page: Page) -> None:
    await page.set_viewport_size({'width': 1280, 'height': 800})
    await page.goto('/')
    await expect(page.locator('#setup-card')).to_be_visible()

    filters_header = page.locator('#filters-accordion-header')
    filters_content = page.locator('#filters-accordion-content')
    if await filters_content.is_hidden():
        await filters_header.click()

    country_filter = page.locator('#country-multi-select')
    await country_filter.evaluate("element => element.style.width = '190px'")
    await country_filter.locator('.multi-select-trigger').click()

    brazil = country_filter.locator('.multi-select-option-label', has_text='Brazil')
    await expect(brazil).to_have_text('Brazil')
    country_options = country_filter.locator('.multi-select-options')
    assert await country_options.evaluate('element => element.scrollWidth <= element.clientWidth')

    await country_filter.locator('.multi-select-trigger').click()

    city_filter = page.locator('#city-multi-select')
    await city_filter.evaluate("element => element.style.width = '300px'")
    await city_filter.locator('.multi-select-trigger').click()

    florianopolis = city_filter.locator('.multi-select-option', has_text='Florianopolis')
    await expect(florianopolis).to_have_attribute('title', 'Florianopolis, Brazil')
    brazil_subtitle = florianopolis.locator('.multi-select-option-sub')
    await expect(brazil_subtitle.locator('.multi-select-option-sub-full')).to_have_text('Brazil')
    await expect(brazil_subtitle.locator('.multi-select-option-sub-compact')).to_be_hidden()

    await city_filter.locator('.multi-select-trigger').click()
    await city_filter.evaluate("element => element.style.width = '250px'")
    await city_filter.locator('.multi-select-trigger').click()

    florianopolis = city_filter.locator('.multi-select-option', has_text='Florianopolis')
    brazil_subtitle = florianopolis.locator('.multi-select-option-sub')
    await expect(brazil_subtitle.locator('.multi-select-option-sub-full')).to_be_hidden()
    await expect(brazil_subtitle.locator('.multi-select-option-sub-compact')).to_have_text('BR')
    city_options = city_filter.locator('.multi-select-options')
    assert await city_options.evaluate('element => element.scrollWidth <= element.clientWidth')

    for width in (360, 375, 390):
        await page.set_viewport_size({'width': width, 'height': 844})
        assert await page.evaluate('document.documentElement.scrollWidth === document.documentElement.clientWidth')
