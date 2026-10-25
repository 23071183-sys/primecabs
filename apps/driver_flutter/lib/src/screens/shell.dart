// Bottom tabs for approved drivers. Anyone else is sent to the right screen for their status.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:primecabs_core/primecabs_core.dart';

import '../app_state.dart';
import '../router.dart';

class DriverShell extends ConsumerWidget {
  const DriverShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(meProvider).value;
    if (me != null) redirectIfStatusChanged(context, me, {DriverStatus.approved});
    return Scaffold(
      body: shell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: shell.currentIndex,
        onDestinationSelected: (i) => shell.goBranch(i, initialLocation: i == shell.currentIndex),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.alt_route_outlined), selectedIcon: Icon(Icons.alt_route), label: 'Trips'),
          NavigationDestination(icon: Icon(Icons.account_balance_wallet_outlined), selectedIcon: Icon(Icons.account_balance_wallet), label: 'Earnings'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Account'),
        ],
      ),
    );
  }
}
