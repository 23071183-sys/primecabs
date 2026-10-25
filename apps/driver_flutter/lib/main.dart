import 'package:flutter/material.dart';
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
    );
  }
}
