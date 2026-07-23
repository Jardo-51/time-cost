import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  LinearScale,
  Tooltip,
} from 'chart.js'
import { color } from 'chart.js/helpers'
import { computed } from 'vue'
import { useTheme } from 'vuetify'

// Imported only by the stats chunk so chart.js stays out of the main bundle.
Chart.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  DoughnutController,
  LinearScale,
  Tooltip,
)

// Maps the active Vuetify theme onto Chart.js colors so charts follow
// light/dark mode reactively.
export function useChartTheme () {
  const theme = useTheme()

  return computed(() => {
    // computedThemes, not current: under <v-app> the injected theme's `current`
    // is the raw theme definition, whose colors never include the on-* pairs
    // Vuetify derives for contrast. Reading `on-surface` off it always missed,
    // leaving the charts black-on-black in dark mode.
    const colors = theme.computedThemes.value[theme.name.value]!.colors
    // Vuetify types colors as string | number | HSV… — charts need strings.
    const onSurface = String(colors['on-surface'] ?? '#000000')
    const surface = String(colors.surface ?? '#ffffff')
    // Alpha has to go through a parser rather than a hex suffix: the derived
    // on-* colors are short hex ("#FFF"), and "#FFF99" is not a color Chart.js
    // can read.
    const fade = (alpha: number) => color(onSurface).alpha(alpha).rgbString()
    return {
      textColor: onSurface,
      mutedColor: fade(0.6),
      gridColor: fade(0.12),
      primary: String(colors.primary ?? '#1976D2'),
      tooltip: {
        backgroundColor: surface,
        titleColor: onSurface,
        bodyColor: onSurface,
        borderColor: fade(0.2),
        borderWidth: 1,
      },
    }
  })
}
