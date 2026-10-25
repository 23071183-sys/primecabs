// Entry: once the profile loads, sends the driver to onboarding, the review screen or the app.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:primecabs_core/primecabs_core.dart';
import 'package:primecabs_ui/primecabs_ui.dart';

import '../app_state.dart';

class StartScreen extends ConsumerWidget {
  const StartScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    if (!session.ready || !session.signedIn) return const _Splash();
    final me = ref.watch(meProvider);
    return me.when(
      data: (me) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (context.mounted) context.go(homeFor(me));
        });
        return const _Splash();
      },
      loading: () => const _Splash(),
      error: (e, _) => Scaffold(
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              ErrorView(message: errorMessage(e), onRetry: () => ref.invalidate(meProvider)),
              Btn('Sign out', kind: BtnKind.ghost, onPressed: () => ref.read(sessionProvider.notifier).signOut()),
            ]),
          ),
        ),
      ),
    );
  }
}

class _Splash extends StatelessWidget {
  const _Splash();
  @override
  Widget build(BuildContext context) => const Scaffold(
        backgroundColor: Brand.navy,
        body: Center(child: CircularProgressIndicator(color: Brand.teal)),
      );
}
