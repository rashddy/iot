/**
 * LoadingScreen – Premium animated splash screen.
 * Swimming fish silhouettes + rising bubbles over a deep purple gradient.
 */

import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Animated, {
    Easing,
    FadeIn,
    FadeOut,
    interpolate,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

/* ══════════════════════════════════════════════
   SWIMMING FISH  – built entirely from Views
   ══════════════════════════════════════════════ */

interface SwimmingFishProps {
  /** vertical position (0-1 of screen height) */
  y: number;
  /** scale multiplier – smaller = farther away */
  size: number;
  /** animation duration for one full swim (ms) */
  speed: number;
  /** start delay (ms) */
  delay: number;
  /** swim direction: 1 = left→right, -1 = right→left */
  direction: 1 | -1;
  /** ghost-opacity ceiling */
  maxOpacity: number;
}

function SwimmingFish({
  y,
  size,
  speed,
  delay,
  direction,
  maxOpacity,
}: SwimmingFishProps) {
  const translateX = useSharedValue(direction === 1 ? -80 : SCREEN_W + 80);
  const wobbleY = useSharedValue(0);

  useEffect(() => {
    // Horizontal swim across the screen, then reset
    const from = direction === 1 ? -80 : SCREEN_W + 80;
    const to = direction === 1 ? SCREEN_W + 80 : -80;

    translateX.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(to, { duration: speed, easing: Easing.inOut(Easing.ease) }),
          withTiming(from, { duration: 0 }), // instant reset
        ),
        -1,
        false,
      ),
    );

    // Gentle vertical wobble while swimming
    wobbleY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(14 * size, {
            duration: speed * 0.25,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(-14 * size, {
            duration: speed * 0.25,
            easing: Easing.inOut(Easing.ease),
          }),
        ),
        -1,
        true,
      ),
    );
  }, [delay, direction, size, speed, translateX, wobbleY]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: wobbleY.value },
      { scaleX: direction as number },
    ],
    opacity: maxOpacity,
  }));

  // Proportions based on size multiplier
  const bodyW = 52 * size;
  const bodyH = 20 * size;
  const tailW = 14 * size;
  const tailH = 11 * size;
  const dorsalW = 14 * size;
  const dorsalH = 10 * size;
  const pectoralW = 9 * size;
  const pectoralH = 6 * size;
  const eyeSize = 5 * size;
  const pupilSize = 2.5 * size;
  const col = 'rgba(201, 190, 255,';

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: SCREEN_H * y,
          flexDirection: 'row',
          alignItems: 'center',
        },
        animStyle,
      ]}
    >
      {/* ── Forked tail (two triangles) ── */}
      <View style={{ marginRight: -5 * size, alignItems: 'flex-end' }}>
        {/* Upper fork */}
        <View
          style={{
            width: 0,
            height: 0,
            borderTopWidth: tailH * 0.6,
            borderBottomWidth: tailH * 0.35,
            borderRightWidth: tailW,
            borderTopColor: 'transparent',
            borderBottomColor: 'transparent',
            borderRightColor: `${col} 0.45)`,
            marginBottom: -2 * size,
          }}
        />
        {/* Lower fork */}
        <View
          style={{
            width: 0,
            height: 0,
            borderTopWidth: tailH * 0.35,
            borderBottomWidth: tailH * 0.6,
            borderRightWidth: tailW,
            borderTopColor: 'transparent',
            borderBottomColor: 'transparent',
            borderRightColor: `${col} 0.40)`,
          }}
        />
      </View>

      {/* ── Caudal peduncle (narrow connector) ── */}
      <View
        style={{
          width: 6 * size,
          height: bodyH * 0.45,
          borderRadius: 3 * size,
          backgroundColor: `${col} 0.42)`,
          marginRight: -3 * size,
        }}
      />

      {/* ── Main body (tapered ellipse) ── */}
      <View
        style={{
          width: bodyW,
          height: bodyH,
          borderRadius: bodyH / 2,
          backgroundColor: `${col} 0.42)`,
          overflow: 'visible',
        }}
      >
        {/* Belly highlight */}
        <View
          style={{
            position: 'absolute',
            bottom: 2 * size,
            left: bodyW * 0.2,
            width: bodyW * 0.5,
            height: 2 * size,
            borderRadius: size,
            backgroundColor: `${col} 0.18)`,
          }}
        />

        {/* Lateral line */}
        <View
          style={{
            position: 'absolute',
            top: bodyH * 0.47,
            left: bodyW * 0.25,
            width: bodyW * 0.5,
            height: 1.2 * size,
            borderRadius: size,
            backgroundColor: `${col} 0.15)`,
          }}
        />

        {/* Eye – white sclera */}
        <View
          style={{
            position: 'absolute',
            right: 8 * size,
            top: bodyH * 0.25,
            width: eyeSize,
            height: eyeSize,
            borderRadius: eyeSize / 2,
            backgroundColor: 'rgba(255,255,255,0.75)',
          }}
        >
          {/* Pupil */}
          <View
            style={{
              position: 'absolute',
              right: 0.8 * size,
              top: (eyeSize - pupilSize) / 2,
              width: pupilSize,
              height: pupilSize,
              borderRadius: pupilSize / 2,
              backgroundColor: 'rgba(30, 15, 80, 0.8)',
            }}
          />
        </View>

        {/* Mouth slit */}
        <View
          style={{
            position: 'absolute',
            right: 2 * size,
            top: bodyH * 0.52,
            width: 4 * size,
            height: 1.2 * size,
            borderRadius: size,
            backgroundColor: `${col} 0.25)`,
          }}
        />
      </View>

      {/* ── Head taper (snout) ── */}
      <View
        style={{
          width: 0,
          height: 0,
          borderTopWidth: bodyH * 0.5,
          borderBottomWidth: bodyH * 0.5,
          borderLeftWidth: 10 * size,
          borderTopColor: 'transparent',
          borderBottomColor: 'transparent',
          borderLeftColor: `${col} 0.42)`,
          marginLeft: -2 * size,
        }}
      />

      {/* ── Dorsal fin (on top) ── */}
      <View
        style={{
          position: 'absolute',
          left: tailW + 6 * size + bodyW * 0.25,
          top: -dorsalH + 2 * size,
          width: 0,
          height: 0,
          borderLeftWidth: dorsalW * 0.3,
          borderRightWidth: dorsalW * 0.7,
          borderBottomWidth: dorsalH,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: `${col} 0.32)`,
        }}
      />

      {/* ── Pectoral fin (side, behind eye) ── */}
      <View
        style={{
          position: 'absolute',
          left: tailW + 6 * size + bodyW * 0.55,
          bottom: -pectoralH + 3 * size,
          width: 0,
          height: 0,
          borderLeftWidth: pectoralW * 0.4,
          borderRightWidth: pectoralW * 0.6,
          borderTopWidth: pectoralH,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderTopColor: `${col} 0.28)`,
        }}
      />
    </Animated.View>
  );
}

/* ══════════════════════════════════════════════
   RISING BUBBLES
   ══════════════════════════════════════════════ */

interface BubbleProps {
  x: number;
  size: number;
  speed: number;
  delay: number;
}

function Bubble({ x, size, speed, delay }: BubbleProps) {
  const translateY = useSharedValue(SCREEN_H + 40);
  const driftX = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0, { duration: 0 }),                     // reset bottom
          withTiming(-60, { duration: speed, easing: Easing.out(Easing.quad) }),
        ),
        -1,
        false,
      ),
    );

    // Slight horizontal drift
    driftX.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(12, { duration: speed * 0.5, easing: Easing.inOut(Easing.ease) }),
          withTiming(-12, { duration: speed * 0.5, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      ),
    );

    opacity.value = withDelay(delay, withTiming(1, { duration: 600 }));
  }, [delay, driftX, opacity, speed, translateY]);

  const animStyle = useAnimatedStyle(() => {
    const progress = interpolate(
      translateY.value,
      [SCREEN_H + 40, -60],
      [0, 1],
    );
    return {
      transform: [
        { translateY: translateY.value },
        { translateX: driftX.value },
      ],
      opacity: interpolate(progress, [0, 0.15, 0.85, 1], [0, 0.5, 0.5, 0]) * opacity.value,
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: x,
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.25)',
          backgroundColor: 'rgba(255, 255, 255, 0.06)',
        },
        animStyle,
      ]}
    />
  );
}

/* ══════════════════════════════════════════════
   LIGHT SHIMMER – a slow-moving highlight band
   ══════════════════════════════════════════════ */

function Shimmer() {
  const translateX = useSharedValue(-SCREEN_W);

  useEffect(() => {
    translateX.value = withDelay(
      600,
      withRepeat(
        withSequence(
          withTiming(SCREEN_W, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
          withTiming(-SCREEN_W, { duration: 0 }),
        ),
        -1,
        false,
      ),
    );
  }, [translateX]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { rotate: '25deg' }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: 0,
          width: SCREEN_W * 0.35,
          height: SCREEN_H * 1.6,
          backgroundColor: 'rgba(255, 255, 255, 0.04)',
        },
        animStyle,
      ]}
    />
  );
}

/* ──────── Dot loader ──────── */
function DotLoader() {
  return (
    <View style={styles.dotRow}>
      {[0, 1, 2].map((i) => (
        <DotItem key={i} index={i} />
      ))}
    </View>
  );
}

function DotItem({ index }: { index: number }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withDelay(
      index * 200,
      withRepeat(
        withSequence(
          withTiming(1.5, { duration: 400, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 400, easing: Easing.out(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );
  }, [index, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: interpolate(scale.value, [1, 1.5], [0.35, 1]),
  }));

  return <Animated.View style={[styles.dot, animStyle]} />;
}

/* ══════════════════════════════════════════════
   MAIN LOADING SCREEN
   ══════════════════════════════════════════════ */

interface LoadingScreenProps {
  onFinish?: () => void;
}

export default function LoadingScreen({ onFinish }: LoadingScreenProps) {
  const logoScale = useSharedValue(0.7);
  const logoOpacity = useSharedValue(0);
  const subtitleOpacity = useSharedValue(0);
  const loaderOpacity = useSharedValue(0);

  /* Fish configs – memoised so they stay stable across renders */
  const fishData = useMemo<SwimmingFishProps[]>(
    () => [
      { y: 0.12, size: 0.9,  speed: 7500,  delay: 0,    direction: 1,  maxOpacity: 0.25 },
      { y: 0.24, size: 1.25, speed: 6000,  delay: 800,  direction: -1, maxOpacity: 0.20 },
      { y: 0.38, size: 0.7,  speed: 9000,  delay: 1500, direction: 1,  maxOpacity: 0.18 },
      { y: 0.58, size: 1.1,  speed: 7000,  delay: 400,  direction: -1, maxOpacity: 0.22 },
      { y: 0.72, size: 0.6,  speed: 8500,  delay: 2000, direction: 1,  maxOpacity: 0.16 },
      { y: 0.82, size: 1.35, speed: 5800,  delay: 1200, direction: -1, maxOpacity: 0.20 },
      { y: 0.45, size: 0.55, speed: 10000, delay: 3000, direction: 1,  maxOpacity: 0.14 },
    ],
    [],
  );

  const bubbleData = useMemo<BubbleProps[]>(
    () => [
      { x: SCREEN_W * 0.15, size: 8,  speed: 5000, delay: 0 },
      { x: SCREEN_W * 0.35, size: 12, speed: 6000, delay: 600 },
      { x: SCREEN_W * 0.55, size: 6,  speed: 4500, delay: 1200 },
      { x: SCREEN_W * 0.75, size: 10, speed: 5500, delay: 300 },
      { x: SCREEN_W * 0.25, size: 14, speed: 7000, delay: 1800 },
      { x: SCREEN_W * 0.65, size: 7,  speed: 4800, delay: 900 },
      { x: SCREEN_W * 0.85, size: 9,  speed: 5200, delay: 2400 },
      { x: SCREEN_W * 0.45, size: 11, speed: 6200, delay: 1500 },
      { x: SCREEN_W * 0.08, size: 8,  speed: 5800, delay: 2000 },
      { x: SCREEN_W * 0.92, size: 6,  speed: 4200, delay: 700  },
    ],
    [],
  );

  useEffect(() => {
    logoOpacity.value = withTiming(1, { duration: 800 });
    logoScale.value = withTiming(1, {
      duration: 1000,
      easing: Easing.out(Easing.back(1.4)),
    });
    subtitleOpacity.value = withDelay(500, withTiming(1, { duration: 600 }));
    loaderOpacity.value = withDelay(900, withTiming(1, { duration: 600 }));

    const timeout = setTimeout(() => onFinish?.(), 7000);
    return () => clearTimeout(timeout);
  }, [logoScale, logoOpacity, subtitleOpacity, loaderOpacity, onFinish]);

  const logoAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
    opacity: logoOpacity.value,
  }));

  const subtitleAnimStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
  }));

  const loaderAnimStyle = useAnimatedStyle(() => ({
    opacity: loaderOpacity.value,
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(400)}
      exiting={FadeOut.duration(500)}
      style={styles.container}
    >
      {/* ── Deep gradient backdrop – explicit full dimensions ── */}
      <LinearGradient
        colors={['#1A0E4B', '#2B1A78', '#4A3AFF', '#6367FF', '#2B1A78', '#10082E']}
        locations={[0, 0.2, 0.4, 0.6, 0.8, 1]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: SCREEN_W, height: SCREEN_H }}
      />

      {/* Secondary overlay – adds depth */}
      <LinearGradient
        colors={['rgba(99, 103, 255, 0.15)', 'transparent', 'rgba(16, 8, 46, 0.5)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: SCREEN_W, height: SCREEN_H }}
      />

      {/* Light shimmer band */}
      <Shimmer />

      {/* ── Swimming fish silhouettes ── */}
      {fishData.map((f, i) => (
        <SwimmingFish key={`fish-${i}`} {...f} />
      ))}

      {/* ── Rising bubbles ── */}
      {bubbleData.map((b, i) => (
        <Bubble key={`bub-${i}`} {...b} />
      ))}

      {/* ── Centre content ── */}
      <View style={styles.center}>
        {/* Logo mark – water-drop shape */}
        <Animated.View style={logoAnimStyle}>
          <View style={styles.logoContainer}>
            <View style={styles.dropOuter}>
              <LinearGradient
                colors={['rgba(255,255,255,0.22)', 'rgba(132,148,255,0.12)']}
                style={styles.dropGradient}
              />
              <View style={styles.dropInner}>
                <View style={styles.waveLine} />
                <View style={[styles.waveLine, styles.waveLine2]} />
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Title */}
        <Animated.View style={[styles.titleBlock, logoAnimStyle]}>
          <Text style={styles.title}>AquaFeed</Text>
          <Text style={styles.titleAccent}> Pro</Text>
        </Animated.View>

        {/* Subtitle */}
        <Animated.View style={subtitleAnimStyle}>
          <Text style={styles.subtitle}>Smart Fish Feeder Control</Text>
        </Animated.View>

        {/* Divider */}
        <Animated.View style={[styles.divider, subtitleAnimStyle]} />

        {/* Dot loader */}
        <Animated.View style={loaderAnimStyle}>
          <DotLoader />
        </Animated.View>
      </View>

      {/* Footer */}
      <Animated.View style={[styles.footer, loaderAnimStyle]}>
        <Text style={styles.footerText}>Powered by ESP32 & Firebase</Text>
      </Animated.View>
    </Animated.View>
  );
}

/* ─── Styles ─── */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: SCREEN_W,
    height: SCREEN_H,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: '#10082E',
  },

  /* Centre cluster */
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },

  /* Logo / water-drop */
  logoContainer: {
    marginBottom: 28,
    alignItems: 'center',
  },
  dropOuter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 39,
  },
  dropInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  waveLine: {
    width: 30,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  waveLine2: {
    width: 20,
    opacity: 0.35,
  },

  /* Title */
  titleBlock: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  title: {
    fontSize: 38,
    fontFamily: 'Montserrat_800ExtraBold',
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  titleAccent: {
    fontSize: 38,
    fontFamily: 'Montserrat_800ExtraBold',
    color: '#C9BEFF',
    letterSpacing: -1,
  },

  subtitle: {
    fontSize: 13,
    fontFamily: 'Montserrat_400Regular',
    color: 'rgba(255, 255, 255, 0.6)',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },

  /* Divider */
  divider: {
    width: 48,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(201, 190, 255, 0.3)',
    marginVertical: 26,
  },

  /* Dots */
  dotRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },

  /* Footer */
  footer: {
    position: 'absolute',
    bottom: 52,
    zIndex: 10,
  },
  footerText: {
    fontSize: 11,
    fontFamily: 'Montserrat_400Regular',
    color: 'rgba(255, 255, 255, 0.3)',
    letterSpacing: 1.2,
  },
});
