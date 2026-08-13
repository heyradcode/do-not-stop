/**
 * @format
 */

if (__DEV__) {
    require("./ReactotronConfig");
}

import './src/shims/installPolyfills';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { installDevLogFilters } from './src/devLogFilters';

installDevLogFilters();

AppRegistry.registerComponent(appName, () => App);
