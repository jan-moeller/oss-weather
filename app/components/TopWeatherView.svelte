<script lang="ts">
    import { createNativeAttributedString } from '@nativescript-community/text';
    import { Align, Canvas, LayoutAlignment, Paint, StaticLayout } from '@nativescript-community/ui-canvas';
    import { LineChart } from '@nativescript-community/ui-chart';
    import { LimitLabelPosition, LimitLine } from '@nativescript-community/ui-chart/components/LimitLine';
    import { XAxisPosition } from '@nativescript-community/ui-chart/components/XAxis';
    import { AxisDependency } from '@nativescript-community/ui-chart/components/YAxis';
    import { LineData } from '@nativescript-community/ui-chart/data/LineData';
    import { LineDataSet, Mode } from '@nativescript-community/ui-chart/data/LineDataSet';
    import { Color } from '@nativescript/core';
    import dayjs from 'dayjs';
    import { createEventDispatcher } from 'svelte';
    import { NativeViewElementNode } from 'svelte-native/dom';
    import HourlyView from '~/components/HourlyView.svelte';
    import WeatherIcon from '~/components/WeatherIcon.svelte';
    import type { FavoriteLocation } from '~/helpers/favorites';
    import { favoriteIcon, favoriteIconColor, isFavorite, toggleFavorite } from '~/helpers/favorites';
    import { convertValueToUnit, formatValueToUnit, toImperialUnit, UNITS } from '~/helpers/formatter';
    import { formatDate, formatTime, l, lc } from '~/helpers/locale';
    import { onThemeChanged } from '~/helpers/theme';
    import { WeatherLocation } from '~/services/api';
    import { appFontFamily, borderColor, fontScale, imperial, mdiFontFamily, nightColor, rainColor, snowColor, textColor, textLightColor, wiFontFamily } from '~/variables';
    const dispatch = createEventDispatcher();

    const textIconPaint = new Paint();
    textIconPaint.setTextAlign(Align.CENTER);
    const textPaint = new Paint();
    // const textIconSubPaint = new Paint();
    // textIconSubPaint.setTextAlign(Align.CENTER);
    const wiPaint = new Paint();
    wiPaint.setFontFamily(wiFontFamily);
    wiPaint.setTextAlign(Align.CENTER);
    const mdiPaint = new Paint();
    mdiPaint.setFontFamily(mdiFontFamily);
    mdiPaint.setTextAlign(Align.CENTER);
    const appPaint = new Paint();
    appPaint.setFontFamily(appFontFamily);
    appPaint.setTextAlign(Align.CENTER);
    interface Item {
        alerts?: any;
        minutely?: MinutelyData[];
        time: number;
        lastUpdate: number;
        sunsetTime: number;
        sunriseTime: number;
        icon: string;
        windIcon: string;
        moonIcon: string;
        windSpeed?: string;
        cloudCover?: number;
        cloudCeiling?: number;
        uvIndex?: number;
        precipProbability?: number;
        precipAccumulation?: number;
        cloudColor?: string;
        uvIndexColor?: string;
        temperatureMin?: number;
        temperatureMax?: number;
        temperature?: number;
        apparentTemperature?: number;
        hourly?;
    }
    export let item: Item;
    export let weatherLocation: FavoriteLocation;
    export let height;
    export let fakeNow;

    function formatLastUpdate(date) {
        if (dayjs(date).isBefore(dayjs().startOf('d'))) {
            return formatDate(date, 'ddd LT');
        } else {
            return formatTime(date, 'LT');
        }
    }
    //@ts-ignore
    let lineChart: NativeViewElementNode<LineChart>;
    let weatherIconSize = 140;
    let topViewHeight = 240;
    let chartInitialized = false;
    let precipChartSet: LineDataSet;
    let cloudChartSet: LineDataSet;
    let lastChartData: {
        time: number;
        intensity: number;
    }[];

    let color: string | Color;
    let precipIcon: string;
    let hasPrecip = false;

    // we need a factor cause using timestamp means
    // using 64bit data which canvas does not support (android Matrix specifically)
    const timeFactor = 1 / (1000 * 60 * 10);
    function updateLineChart(item: Item) {
        const chart = lineChart?.nativeView;
        if (chart) {
            let data = item.minutely;
            let now = fakeNow || Date.now();
            const index = data.findIndex((v) => v.time >= now);
            now = Math.floor(now * timeFactor);
            const delta = now;
            now -= delta;
            data = data
                .slice(index)
                .map((d) => ({ ...d, time: Math.floor(d.time * timeFactor - delta) }))
                .filter((item, pos, arr) => arr.findIndex((d) => d.time === item.time) === pos);
            if (lastChartData === data) {
                return;
            }
            lastChartData = data;
            if (!data || data.length === 0) {
                hasPrecip = false;
                if (precipChartSet) {
                    precipChartSet.clear();
                }
                if (cloudChartSet) {
                    cloudChartSet.clear();
                }
                return;
            }
            if (data[0].time > 0) {
                data.unshift({ time: data[0].time - 1, intensity: 0 });
            }
            DEV_LOG && console.log('data', JSON.stringify(data));
            const xAxis = chart.getXAxis();
            const leftAxis = chart.getAxisLeft();
            if (!chartInitialized) {
                chartInitialized = true;
                chart.setNoDataText(null);
                chart.setAutoScaleMinMaxEnabled(true);
                chart.setDoubleTapToZoomEnabled(true);
                chart.getLegend().setEnabled(false);
                xAxis.setEnabled(true);
                xAxis.setTextSize(10 * $fontScale);
                xAxis.setLabelTextAlign(Align.CENTER);
                xAxis.setDrawGridLines(false);
                // xAxis.setCenterAxisLabels(true);
                xAxis.ensureLastLabel = true;
                // xAxis.setGranularity(10 * 60 * 1000)
                // xAxis.setGranularityEnabled(true)
                xAxis.setDrawMarkTicks(true);
                xAxis.setValueFormatter({
                    getAxisLabel: (value, axis) => dayjs(value / timeFactor + delta).diff(now / timeFactor + delta, 'm') + 'm'
                });
                xAxis.setPosition(XAxisPosition.BOTTOM);

                // const rightAxis = char   t.getAxisRight();
                // rightAxis.setEnabled(false);

                leftAxis.setAxisMinimum(0);
                leftAxis.setDrawGridLines(false);
                leftAxis.setDrawLabels(false);
                leftAxis.setDrawMarkTicks(false);
                leftAxis.setDrawAxisLine(false);
                // leftAxis.removeAllLimitLines();
                [
                    { limit: 1, label: l('light') },
                    { limit: 2, label: l('medium') },
                    { limit: 3, label: l('heavy') }
                ].forEach((l) => {
                    const limitLine = new LimitLine(l.limit, l.label.toUpperCase());
                    limitLine.setLineWidth(1);
                    limitLine.setXOffset(0);
                    limitLine.setTextSize(8 * $fontScale);
                    limitLine.setYOffset(1);
                    limitLine.enableDashedLine(2, 2, 0);
                    // limitLine.setLineColor('red');
                    limitLine.setLabelPosition(LimitLabelPosition.RIGHT_TOP);
                    leftAxis.addLimitLine(limitLine);
                });
            }
            const limitColor = new Color($textColor).setAlpha(100).hex;
            leftAxis.getLimitLines().forEach((l) => {
                l.setTextColor(limitColor);
                l.setLineColor(limitColor);
            });
            xAxis.setTextColor($textColor);
            xAxis.setAxisMinValue(0);

            // we want exactly one label per 10 min
            const labelCount = data.length ? (data[data.length - 1].time - now) / (10 * 60 * 1000 * timeFactor) + 1 : 0;
            xAxis.setLabelCount(labelCount, true);

            let needsToSetData = false;
            let needsUpdate = false;
            hasPrecip = data.some((d) => d.intensity > 0);

            leftAxis.setAxisMinimum(0);
            leftAxis.setAxisMaximum(4);
            leftAxis.setDrawLimitLines(hasPrecip);
            if (hasPrecip) {
                const color = item.icon.startsWith('13') ? snowColor : rainColor;
                if (!precipChartSet) {
                    needsToSetData = true;
                    precipChartSet = new LineDataSet(data, 'intensity', 'time', 'intensity');
                    precipChartSet.setAxisDependency(AxisDependency.LEFT);
                    precipChartSet.setLineWidth(1);
                    // precipChartSet.setDrawCircles(true);
                    precipChartSet.setDrawFilled(true);
                    precipChartSet.setFillAlpha(150);
                    precipChartSet.setMode(Mode.CUBIC_BEZIER);
                    precipChartSet.setCubicIntensity(0.4);
                } else {
                    precipChartSet.setValues(data);
                    needsUpdate = true;
                }

                precipChartSet.setColor(color);
                precipChartSet.setFillColor(color);
            } else if (precipChartSet && precipChartSet.getEntryCount() > 0) {
                precipChartSet.clear();
                needsToSetData = true;
            }
            // const hasCloud = data.some((d) => d.cloudCeiling > 0);
            // const rightAxis = chart.getAxisRight();
            // rightAxis.setDrawLabels(hasCloud);
            // // console.log('hasCloud', hasCloud, data);
            // if (hasCloud) {
            //     // rightAxis.setLabelCount(4, false);
            //     if (!cloudChartSet) {
            //         needsToSetData = true;
            //         cloudChartSet = new LineDataSet(data, 'cloudCeiling', 'time', 'cloudCeiling');
            //         cloudChartSet.setAxisDependency(AxisDependency.RIGHT);
            //         cloudChartSet.setLineWidth(2);
            //         cloudChartSet.setDrawIcons(false);
            //         cloudChartSet.setDrawValues(false);
            //         cloudChartSet.setDrawFilled(false);
            //         cloudChartSet.setColor('gray');
            //         cloudChartSet.setMode(Mode.HORIZONTAL_BEZIER);
            //     } else {
            //         cloudChartSet.setValues(data);
            //         needsUpdate = true;
            //     }
            // } else if (cloudChartSet) {
            //     cloudChartSet.clear();
            // }
            if (needsToSetData) {
                chart.setData(new LineData([precipChartSet].filter((s) => !!s)));
            } else if (needsUpdate) {
                precipChartSet.notifyDataSetChanged();
                chart.getData().notifyDataChanged();
                chart.notifyDataSetChanged();
            }
        }
    }
    $: hasPrecip && canvasView?.nativeView.invalidate();
    $: item && canvasView?.nativeView.invalidate();
    $: if (lineChart) {
        updateLineChart(item);
    }

    $: if (weatherLocation) {
        weatherLocation.isFavorite = isFavorite(weatherLocation);
    }

    $: if (item && item.icon.startsWith('13')) {
        color = snowColor;
        precipIcon = 'wi-snowflake-cold';
    } else {
        color = rainColor;
        precipIcon = 'wi-raindrop';
    }

    onThemeChanged(() => {
        const chart = lineChart?.nativeView;
        if (chart) {
            chart.getXAxis().setTextColor($textColor);
            chart.invalidate();
            const limitColor = new Color($textColor).setAlpha(0.5).hex;
            chart
                .getAxisLeft()
                .getLimitLines()
                .forEach((l) => {
                    l.setTextColor(limitColor);
                    l.setLineColor(limitColor);
                });
        }
    });
    let canvasView;
    function redraw() {
        if (chartInitialized) {
            const chart = lineChart?.nativeView;
            const xAxis = chart.getXAxis();
            const leftAxis = chart.getAxisLeft();
            leftAxis.getLimitLines().forEach((l) => {
                l.setTextSize(8 * $fontScale);
            });
            xAxis.setTextSize(10 * $fontScale);
        }
        lineChart?.nativeView.invalidate();
        canvasView?.nativeView.invalidate();
    }
    fontScale.subscribe(redraw);
    function drawOnCanvas({ canvas }: { canvas: Canvas }) {
        const w = canvas.getWidth();
        const h = canvas.getHeight();
        let centeredItemsToDraw: {
            color?: string | Color;
            paint?: Paint;
            iconFontSize: number;
            icon: string;
            value: string | number;
            subvalue?: string;
        }[] = [];
        const iconFontSize = 20 * $fontScale;
        if (item.windSpeed) {
            centeredItemsToDraw.push({
                iconFontSize,
                paint: appPaint,
                icon: item.windIcon,
                value: convertValueToUnit(item.windSpeed, UNITS.Speed, $imperial)[0],
                subvalue: toImperialUnit(UNITS.Speed, $imperial)
            });
        }
        centeredItemsToDraw.push({
            paint: wiPaint,
            color: nightColor,
            iconFontSize,
            icon: item.moonIcon,
            value: l('moon')
        });
        if ((item.precipProbability === -1 || item.precipProbability > 10) && item.precipAccumulation >= 1) {
            centeredItemsToDraw.push({
                paint: wiPaint,
                color: color,
                iconFontSize,
                icon: precipIcon,
                value: formatValueToUnit(item.precipAccumulation, UNITS.MM, $imperial),
                subvalue: item.precipProbability > 0 && item.precipProbability + '%'
            });
        } else if (item.cloudCover > 20) {
            centeredItemsToDraw.push({
                paint: wiPaint,
                color: item.cloudColor,
                iconFontSize,
                icon: 'wi-cloud',
                value: Math.round(item.cloudCover) + '%',
                subvalue: item.cloudCeiling && formatValueToUnit(item.cloudCeiling, UNITS.Distance, $imperial)
            });
        }
        if (item.uvIndex > 0) {
            centeredItemsToDraw.push({
                paint: mdiPaint,
                color: item.uvIndexColor,
                iconFontSize: 24 * $fontScale,
                icon: 'mdi-weather-sunny-alert',
                value: Math.round(item.uvIndex)
            });
        }
        const iconsTop = hasPrecip ? 60 : topViewHeight / 2 - 20 * $fontScale;
        const iconsLeft = 26;
        centeredItemsToDraw.forEach((c, index) => {
            let x = index * 45 * $fontScale + iconsLeft;
            const paint = c.paint || textIconPaint;
            paint.setTextSize(c.iconFontSize);
            paint.setColor(c.color || $textColor);
            if (c.icon) {
                canvas.drawText(c.icon, x, iconsTop + 20, paint);
            }
            if (c.value) {
                textIconPaint.setTextSize(12 * $fontScale);
                textIconPaint.setColor(c.color || $textColor);
                canvas.drawText(c.value + '', x, iconsTop + 20 + 19 * $fontScale, textIconPaint);
            }
            if (c.subvalue) {
                textIconPaint.setTextSize(9 * $fontScale);
                textIconPaint.setColor(c.color || $textColor);
                canvas.drawText(c.subvalue + '', x, iconsTop + 20 + 30 * $fontScale, textIconPaint);
            }
        });
        textPaint.setColor($textColor);
        if (item.temperature) {
            textPaint.setTextAlign(Align.LEFT);
            textPaint.setTextSize(36 * $fontScale);
            canvas.drawText(formatValueToUnit(item.temperature, UNITS.Celcius, $imperial), 10, 36 * $fontScale, textPaint);
        }
        const nString = createNativeAttributedString({
            spans: [
                {
                    fontSize: 17 * $fontScale,
                    color: $textLightColor,
                    text: formatValueToUnit(item.temperatureMin, UNITS.Celcius, $imperial)
                },
                {
                    fontSize: 20 * $fontScale,
                    color: $textColor,
                    text: ' ' + formatValueToUnit(item.temperatureMax, UNITS.Celcius, $imperial)
                }
            ]
        });
        canvas.save();
        const staticLayout = new StaticLayout(nString, textPaint, w - 10, LayoutAlignment.ALIGN_OPPOSITE, 1, 0, false);
        canvas.translate(0, 30 * $fontScale);
        staticLayout.draw(canvas);
        canvas.restore();

        canvas.save();
        canvas.translate(10, h - 16 - 14 * $fontScale);
        textPaint.setTextSize(14 * $fontScale);
        new StaticLayout(
            createNativeAttributedString({
                spans: [
                    {
                        color: '#ffa500',
                        fontFamily: wiFontFamily,
                        text: 'wi-sunrise '
                    },
                    {
                        text: formatTime(item.sunriseTime)
                    },
                    {
                        color: '#ff7200',
                        fontFamily: wiFontFamily,
                        text: '  wi-sunset '
                    },
                    {
                        text: formatTime(item.sunsetTime)
                    }
                ]
            }),
            textPaint,
            w - 10,
            LayoutAlignment.ALIGN_NORMAL,
            1,
            0,
            false
        ).draw(canvas);
        canvas.restore();

        textPaint.setTextAlign(Align.RIGHT);
        textPaint.setTextSize(20 * $fontScale);
        canvas.drawText(formatDate(item.time, 'dddd'), w - 10, 22 * $fontScale, textPaint);
        textPaint.setTextSize(14 * $fontScale);
        canvas.drawText(`${lc('last_updated')}: ${formatLastUpdate(item.lastUpdate)}`, w - 10, h - 14, textPaint);

        textPaint.setColor($borderColor);
        canvas.drawLine(0, h, w, h - 1, textPaint);
    }

    function toggleItemFavorite(item: FavoriteLocation) {
        weatherLocation = toggleFavorite(item);
    }
</script>

<gridLayout rows={`${topViewHeight},*`} {height} columns="*,auto">
    <canvas bind:this={canvasView} colSpan={2} on:draw={drawOnCanvas} paddingLeft={10} paddingBottom={10} paddingRight={10}>
        <!-- <cgroup fontSize={14 * $fontScale} verticalAlignment="bottom">
            <cspan color="#ffa500" fontFamily={wiFontFamily} text="wi-sunrise " />
            <cspan text={formatTime(item.sunriseTime)} />
            <cspan color="#ff7200" fontFamily={wiFontFamily} text="  wi-sunset " />
            <cspan text={formatTime(item.sunsetTime)} />
        </cgroup> -->
    </canvas>
    <!-- <mdbutton
        col={1}
        variant="text"
        class="icon-btn"
        marginRight={4}
        width={30}
        height={30}
        color={favoriteIconColor(weatherLocation)}
        rippleColor="#EFB644"
        on:tap={() => toggleItemFavorite(weatherLocation)}
        text={favoriteIcon(weatherLocation)}
        verticalAlignment="top"
        horizontalAlignment="left"
    /> -->
    <linechart bind:this={lineChart} visibility={hasPrecip ? 'visible' : 'hidden'} verticalAlignment="bottom" height={90} marginBottom={40} />
    <WeatherIcon col={1} horizontalAlignment="right" verticalAlignment="center" size={weatherIconSize * (2 - $fontScale)} icon={item.icon} on:tap={(event) => dispatch('tap', event)} />
    <HourlyView row={1} colSpan={2} items={item.hourly} />
</gridLayout>
