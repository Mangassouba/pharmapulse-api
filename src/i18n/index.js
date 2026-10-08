import i18next from 'i18next'
import middleware from 'i18next-http-middleware'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const fr = require('./locales/fr.json')
const en = require('./locales/en.json')
const ar = require('./locales/ar.json')

await i18next
  .use(middleware.LanguageDetector)
  .init({
    fallbackLng: 'fr',
    supportedLngs: ['fr', 'en', 'ar'],
    resources: {
      fr: { translation: fr },
      en: { translation: en },
      ar: { translation: ar },
    },
    detection: {
      order: ['header', 'querystring'],
      lookupHeader: 'accept-language',
      lookupQuerystring: 'lang',
    },
    interpolation: { escapeValue: false },
  })

export { i18next, middleware }
