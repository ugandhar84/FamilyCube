import { ReactNode } from 'react';
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleProp, ViewStyle, View, ScrollViewProps,
} from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { useAuthScale } from '@/lib/useAuthScale';

interface ResponsiveAuthContainerProps {
  children: ReactNode;
  scroll?: boolean;
  keyboardAvoiding?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollViewProps?: Partial<ScrollViewProps>;
  backgroundColor?: string;
  edges?: Edge[];
}

/**
 * Root shell for auth/onboarding/profile-creation screens. On phone this is
 * a transparent pass-through — SafeAreaView > (KeyboardAvoidingView?) >
 * (ScrollView, contentContainerStyle exactly as passed) > children — adding
 * nothing beyond what each screen already wrote by hand, so phone output
 * stays pixel-identical. On iPad ('kitchenHub'), the same chain gets
 * alignItems:'center' merged into the scroll content and children get
 * wrapped in one extra centered, max-width View. That's the entire tablet
 * contribution: a centered box, no added padding — each screen's own
 * padding becomes the visible side-gutters against the narrower box.
 */
export default function ResponsiveAuthContainer({
  children,
  scroll = true,
  keyboardAvoiding = false,
  contentContainerStyle,
  scrollViewProps,
  backgroundColor,
  edges,
}: ResponsiveAuthContainerProps) {
  const scale = useAuthScale();

  const content = scale.isTablet
    ? <View style={{ width: '100%', maxWidth: scale.maxWidth, alignSelf: 'center' }}>{children}</View>
    : children;

  const inner = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[contentContainerStyle, scale.isTablet && { alignItems: 'center' }]}
      {...scrollViewProps}
    >
      {content}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, contentContainerStyle, scale.isTablet && { alignItems: 'center' }]}>
      {content}
    </View>
  );

  const wrapped = keyboardAvoiding ? (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {inner}
    </KeyboardAvoidingView>
  ) : inner;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor }} edges={edges}>
      {wrapped}
    </SafeAreaView>
  );
}
