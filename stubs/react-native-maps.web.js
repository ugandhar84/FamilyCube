// Web stub — react-native-maps is native-only; renders nothing on web.
import React from 'react';
import { View } from 'react-native';

const Noop = () => null;

const MapView = React.forwardRef((props, _ref) =>
  React.createElement(View, { style: props.style })
);
MapView.displayName = 'MapView';

export default MapView;
export const Marker         = Noop;
export const Polyline       = Noop;
export const Polygon        = Noop;
export const Circle         = Noop;
export const Callout        = Noop;
export const PROVIDER_GOOGLE = 'google';
export const PROVIDER_DEFAULT = null;
