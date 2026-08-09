import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Dimensions } from 'react-native';
import Svg, { Circle, Path, Defs, LinearGradient, Stop, G, Text as SvgText } from 'react-native-svg';

const { width, height } = Dimensions.get('window');

export default function PetlySplashScreen() {
  // Animation values
  const scaleAnim = useRef(new Animated.Value(0.3)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Scale in animation
    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

    // Fade in
    Animated.timing(opacityAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();

    // Rotating paw animation
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 3000,
        useNativeDriver: true,
      })
    ).start();

    // Pulse animation (heart/care)
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [scaleAnim, opacityAnim, rotateAnim, pulseAnim]);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      {/* Background Gradient */}
      <View style={styles.background} />

      {/* Main Logo Container */}
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: opacityAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {/* Animated Petly Logo */}
        <Svg width={280} height={280} viewBox="0 0 400 400">
          <Defs>
            {/* Brand Gradients */}
            <LinearGradient id="purpleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#7C5CBF" stopOpacity="1" />
              <Stop offset="100%" stopColor="#5A3A9E" stopOpacity="1" />
            </LinearGradient>

            <LinearGradient id="coralGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#FF8C55" stopOpacity="1" />
              <Stop offset="100%" stopColor="#F97316" stopOpacity="1" />
            </LinearGradient>

            <LinearGradient id="tealGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#14B8A6" stopOpacity="1" />
              <Stop offset="100%" stopColor="#0D9488" stopOpacity="1" />
            </LinearGradient>

            <LinearGradient id="allGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#7C5CBF" stopOpacity="1" />
              <Stop offset="50%" stopColor="#FF8C55" stopOpacity="1" />
              <Stop offset="100%" stopColor="#14B8A6" stopOpacity="1" />
            </LinearGradient>
          </Defs>

          {/* Outer Circle Background */}
          <Circle cx="200" cy="200" r="180" fill="none" stroke="url(#purpleGrad)" strokeWidth="2" opacity="0.2" />
          <Circle cx="200" cy="200" r="160" fill="none" stroke="url(#coralGrad)" strokeWidth="1.5" opacity="0.15" />

          {/* Main Paw Mark (Center) */}
          <G>
            {/* Center Pad */}
            <Circle cx="200" cy="220" r="35" fill="url(#purpleGrad)" />

            {/* Top Toe */}
            <Circle cx="200" cy="145" r="22" fill="url(#purpleGrad)" opacity="0.9" />

            {/* Left Toe */}
            <Circle cx="125" cy="195" r="20" fill="url(#coralGrad)" opacity="0.9" />

            {/* Right Toe */}
            <Circle cx="275" cy="195" r="20" fill="url(#tealGrad)" opacity="0.9" />

            {/* Bottom Right Toe */}
            <Circle cx="250" cy="265" r="18" fill="url(#coralGrad)" opacity="0.8" />

            {/* Heart in Center */}
            <Path
              d="M 195 210 Q 190 205 185 210 Q 180 215 195 230 Q 210 215 205 210 Q 200 205 195 210"
              fill="url(#coralGrad)"
              opacity="0.9"
            />
          </G>

          {/* Orbiting Dots (Community) */}
          <G opacity="0.6">
            <Circle cx="350" cy="200" r="8" fill="url(#tealGrad)" />
            <Circle cx="50" cy="200" r="8" fill="url(#purpleGrad)" />
            <Circle cx="200" cy="50" r="8" fill="url(#coralGrad)" />
            <Circle cx="200" cy="350" r="8" fill="url(#tealGrad)" />
          </G>
        </Svg>
      </Animated.View>

      {/* Pulsing Heart Accent */}
      <Animated.View
        style={[
          styles.heartAccent,
          {
            transform: [{ scale: pulseAnim }],
          },
        ]}
      >
        <Text style={styles.heartEmoji}>💜</Text>
      </Animated.View>

      {/* Brand Text */}
      <Animated.View
        style={[
          styles.textContainer,
          {
            opacity: opacityAnim,
          },
        ]}
      >
        <Text style={styles.brandName}>petly</Text>
        <Text style={styles.tagline}>Thriving Together</Text>
      </Animated.View>

      {/* Loading Dots */}
      <View style={styles.dotsContainer}>
        <LoadingDot delay={0} />
        <LoadingDot delay={200} />
        <LoadingDot delay={400} />
      </View>
    </View>
  );
}

// Animated loading dot component
function LoadingDot({ delay }: { delay: number }) {
  const dotAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(dotAnim, {
        toValue: 1,
        duration: 1200,
        delay,
        useNativeDriver: true,
      })
    ).start();
  }, [dotAnim, delay]);

  const translateY = dotAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, -12, 0],
  });

  return (
    <Animated.View
      style={[
        styles.loadingDot,
        {
          transform: [{ translateY }],
        },
      ]}
    />
  );
}

// Simple Text component (React Native)
function Text({ style, children }: { style?: any; children: React.ReactNode }) {
  return <View style={[style, { alignItems: 'center' }]} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FAFAFA',
  },
  logoContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 60,
  },
  textContainer: {
    alignItems: 'center',
    position: 'absolute',
    bottom: 180,
  },
  brandName: {
    fontSize: 48,
    fontWeight: '900',
    color: '#1A1A2E',
    letterSpacing: -1,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    fontWeight: '600',
    color: '#7C5CBF',
    letterSpacing: 1,
  },
  heartAccent: {
    position: 'absolute',
    top: width * 0.15,
    right: width * 0.1,
  },
  heartEmoji: {
    fontSize: 48,
  },
  dotsContainer: {
    flexDirection: 'row',
    position: 'absolute',
    bottom: 100,
    gap: 12,
  },
  loadingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#7C5CBF',
  },
});
