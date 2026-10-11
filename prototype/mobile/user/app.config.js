const fs = require('fs')
const path = require('path')

/**
 * Adds what cannot live in app.json because it differs per build or is a
 * secret: the app variant, the Firebase config file and the Maps key.
 *
 *   APP_VARIANT                  development | preview | production (set in eas.json)
 *   GOOGLE_SERVICES_JSON         path to google-services.json (EAS file secret), or
 *                                drop the file next to this one for a local build
 *   GOOGLE_MAPS_API_KEY_ANDROID  Maps SDK for Android key
 *
 * Without google-services.json the app still builds, but FCM cannot issue a
 * device token, so trip updates arrive only while the app is open. Without the
 * Maps key the trip screens show the addresses instead of a map.
 */
const VARIANTS = {
  development: { name: 'MyDriver (Dev)', suffix: '.dev' },
  preview: { name: 'MyDriver (Test)', suffix: '.preview' },
  production: { name: 'MyDriver', suffix: '' },
}

module.exports = ({ config }) => {
  const variant = VARIANTS[process.env.APP_VARIANT] ?? VARIANTS.production

  const localServices = path.join(__dirname, 'google-services.json')
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ?? (fs.existsSync(localServices) ? './google-services.json' : undefined)
  const mapsKey = process.env.GOOGLE_MAPS_API_KEY_ANDROID

  return {
    ...config,
    name: variant.name,
    // The app cannot read android.config at runtime (it is stripped from the
    // public config), so say here whether this build has a Maps key.
    extra: { ...config.extra, mapsEnabled: Boolean(mapsKey) },
    ios: { ...config.ios, bundleIdentifier: `${config.ios.bundleIdentifier}${variant.suffix}` },
    android: {
      ...config.android,
      package: `${config.android.package}${variant.suffix}`,
      ...(googleServicesFile ? { googleServicesFile } : {}),
      ...(mapsKey ? { config: { googleMaps: { apiKey: mapsKey } } } : {}),
    },
  }
}
