/**
 * @format
 */

if (__DEV__) {
    require("./ReactotronConfig");
}

/*
 * First, and a side-effect import rather than a call below.
 *
 * `import` statements are hoisted and run before anything in this module body, so a call
 * down there happens *after* `./App` has already been evaluated. That import reaches
 * `AppKitConfig`, which builds the WalletConnect client, whose pino logger captures
 * `console.error` by reference the moment it is created (`write.apply(proto, args)` in
 * pino's browser build). A wrapper installed after that point is never consulted, which is
 * exactly how the filter came to be installed correctly and change nothing.
 */
import './src/devLogFilters';

import './src/shims/installPolyfills';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
