<script lang="ts">
    import { Color, Utils } from '@nativescript/core';
    import { getString } from '@nativescript/core/application-settings';
    import { closeBottomSheet } from '~/utils/svelte/bottomsheet';
    import CActionBar from '~/components/CActionBar.svelte';
    import WeatherComponent from '~/components/WeatherComponent.svelte';
    import { WeatherLocation, geocodeAddress, networkService, prepareItems } from '~/services/api';
    import { backgroundColor } from '~/variables';
    import { l, lc } from '~/helpers/locale';

    let items = [];
    let loading = false;
    export let weatherLocation: WeatherLocation;
    export let name;
    networkService.start(); // ensure it is started

    async function refresh(weatherLocation: WeatherLocation) {
        loading = true;
        try {
            const provider: 'meteofrance' | 'openweathermap' | 'openmeteo' = getString('provider', 'meteofrance') as any;
            let data: WeatherData;
            if (provider === 'openmeteo') {
                const providerModule = await import('~/services/om');
                data = await providerModule.getWeather(weatherLocation);
            } else if (provider === 'openweathermap') {
                const providerModule = await import('~/services/owm');
                data = await providerModule.getWeather(weatherLocation);
            } else if (provider === 'meteofrance') {
                const providerModule = await import('~/services/mf');
                data = await providerModule.getWeather(weatherLocation);
            }
            DEV_LOG && console.log('refresh', name, typeof name, weatherLocation);
            if (!name || !weatherLocation.sys.city) {
                try {
                    const r = await geocodeAddress(weatherLocation.coord);
                    if (!weatherLocation.sys) {
                        weatherLocation.sys = r.sys;
                    }
                    if (!name) {
                        name = weatherLocation.name = weatherLocation.sys.name = r.name;
                    }
                } catch (error) {
                    console.error(error);
                }
            }

            if (!name) {
                name = weatherLocation.coord.lat.toFixed(2) + ',' + weatherLocation.coord.lon.toFixed(2);
            }
            items = prepareItems(weatherLocation, data, Date.now());
        } catch (err) {
            android.widget.Toast.makeText(Utils.android.getApplicationContext(), err.toString(), android.widget.Toast.LENGTH_LONG);
            closeBottomSheet();
        } finally {
            loading = false;
        }
    }
    $: refresh(weatherLocation);
    let provider: 'meteofrance' | 'openweathermap' | 'openmeteo' = getString('provider', 'meteofrance') as any;
</script>

<gridlayout rows="auto,*" class="weatherpage" height="100%">
    <CActionBar title={name}>
        <activityIndicator busy={loading} verticalAlignment="middle" visibility={loading ? 'visible' : 'collapsed'} />
    </CActionBar>
    <label
                    row={0}
                    fontSize={10}
                    backgroundColor={new Color($backgroundColor).setAlpha(100).hex}
                    text={lc('powered_by', l(`provider.${provider}`))}
                    verticalAlignment="top"
                    horizontalAlignment="right"
                    marginRight={6}
                />
    <WeatherComponent row={1} {items} {weatherLocation} />
</gridlayout>
