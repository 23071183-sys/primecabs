import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:primecabs_ui/primecabs_ui.dart';

import 'src/router.dart';

void main() {
  runApp(const ProviderScope(child: DriverApp()));
}

class DriverApp extends ConsumerWidget {
  const DriverApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'PrimeCabs Driver',
      debugShowCheckedModeBanner: false,
      theme: pcTheme(Brightness.light),
      darkTheme: pcTheme(Brightness.dark),
      routerConfig: ref.watch(routerProvider),
      // Every screen starts with a navy header, so the status bar text is always light.
      builder: (context, child) => AnnotatedRegion<SystemUiOverlayStyle>(value: SystemUiOverlayStyle.light, child: child!),
    );
  }
}
