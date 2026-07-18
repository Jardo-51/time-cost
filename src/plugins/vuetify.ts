import { createVuetify } from 'vuetify'
import { initialDarkMode } from '@/utils/theme'
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'

export default createVuetify({
  theme: {
    defaultTheme: initialDarkMode() ? 'dark' : 'light',
  },
})
