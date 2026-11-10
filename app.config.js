const appJson = require('./app.json');

function reverseClientId(clientId) {
  const suffix = '.apps.googleusercontent.com';
  if (!clientId || !clientId.endsWith(suffix)) {
    return null;
  }
  return clientId.split('.').reverse().join('.');
}

module.exports = ({ config }) => {
  const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '';
  const redirectScheme = reverseClientId(androidClientId);
  const configuredSchemes = config.scheme ?? appJson.expo.scheme ?? [];
  const schemes = Array.isArray(configuredSchemes) ? [...configuredSchemes] : [configuredSchemes];
  if (redirectScheme && !schemes.includes(redirectScheme)) {
    schemes.push(redirectScheme);
  }
  return {
    ...config,
    scheme: schemes,
  };
};
