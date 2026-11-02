import { registerRootComponent } from 'expo';
// Defines the background location task. It must load before the app renders:
// the OS can start the app with no UI just to deliver a fix.
import './src/lib/tracking';
import App from './App';

registerRootComponent(App);
