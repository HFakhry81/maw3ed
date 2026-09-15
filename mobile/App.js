import React from "react";
import { SafeAreaView, StatusBar, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";

// Android emulator → host machine. Override via app.json extra later if needed.
const uri = "http://10.0.2.2:7000/book.html?slug=maw3ed-demo";

export default function App() {
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <WebView source={{ uri }} startInLoadingState allowsBackForwardNavigationGestures />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#eaf2ff" }
});
