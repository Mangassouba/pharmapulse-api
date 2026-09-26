import i18next from 'i18next'
import middleware from 'i18next-http-middleware'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const fr = require('./locales/fr.json')
const en = require('./locales/en.json')

await i18next
  .use(middleware.LanguageDetector)
  .init({
    fallbackLng: 'fr',
    supportedLngs: ['fr', 'en'],
    resources: {
      fr: { translation: fr },
      en: { translation: en },
    },
    detection: {
      order: ['header', 'querystring'],
      lookupHeader: 'accept-language',
      lookupQuerystring: 'lang',
    },
    interpolation: { escapeValue: false },
  })

export { i18next, middleware }
