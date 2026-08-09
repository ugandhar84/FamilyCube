import { ImageStyle, ViewStyle } from 'react-native';
import { Image } from 'expo-image';

interface Props {
  uri: string;
  style?: ImageStyle | ViewStyle | any;
  resizeMode?: 'cover' | 'contain' | 'fill' | 'scale-down' | 'none';
  loaderSize?: number;
  onError?: () => void;
}

export default function LazyImage({ uri, style, resizeMode = 'cover', onError }: Props) {
  return (
    <Image
      source={{ uri }}
      style={style as any}
      contentFit={resizeMode as any}
      cachePolicy="memory-disk"
      transition={220}
      onError={onError ? () => onError() : undefined}
    />
  );
}
