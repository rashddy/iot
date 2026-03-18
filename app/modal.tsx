/**
 * AquaFeed Pro – Info Modal
 */
import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

export default function ModalScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>AquaFeed Pro</Text>
      <Text style={styles.desc}>
        Configure your smart fish feeder settings and schedules from the
        Dashboard tab. View device diagnostics on the Device tab.
      </Text>
      <Link href="/" dismissTo style={styles.link}>
        <Text style={styles.linkText}>Back to Dashboard</Text>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f7f6fd',
  },
  title: {
    fontSize: 26,
    fontFamily: 'Montserrat_800ExtraBold',
    color: '#6367FF',
  },
  desc: {
    textAlign: 'center',
    marginTop: 16,
    maxWidth: 300,
    lineHeight: 22,
    fontSize: 14,
    fontFamily: 'Montserrat_400Regular',
    color: '#8494FF',
  },
  link: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#6367FF',
    borderRadius: 12,
  },
  linkText: {
    color: '#fff',
    fontFamily: 'Montserrat_600SemiBold',
    fontSize: 14,
  },
});
