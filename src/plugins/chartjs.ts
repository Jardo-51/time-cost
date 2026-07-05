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
    const colors = theme.current.value.colors
    // Vuetify types colors as string | number | HSV… — charts need strings.
    const onSurface = String(colors['on-surface'] ?? '#000000')
    const surface = String(colors.surface ?? '#ffffff')
    return {
      textColor: onSurface,
      mutedColor: `${onSurface}99`,
      gridColor: `${onSurface}1f`,
      primary: String(colors.primary ?? '#1976D2'),
      tooltip: {
        backgroundColor: surface,
        titleColor: onSurface,
        bodyColor: onSurface,
        borderColor: `${onSurface}33`,
        borderWidth: 1,
      },
    }
  })
}
