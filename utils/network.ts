import NetInfo from '@react-native-community/netinfo';
import { Alert } from 'react-native';

export const checkNetworkConnection = async (actionDesc?: string) => {
  const netInfo = await NetInfo.fetch();
  if (!netInfo.isConnected) {
    Alert.alert('Offline Mode', `You are currently offline. ${actionDesc || 'This action requires an internet connection.'}`);
    return false;
  }
  return true;
};
