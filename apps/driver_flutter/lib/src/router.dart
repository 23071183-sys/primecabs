import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:primecabs_core/primecabs_core.dart';

import 'app_state.dart';
import 'screens/account_screen.dart';
import 'screens/documents_screen.dart';
import 'screens/earnings_screen.dart';
import 'screens/home_screen.dart';
import 'screens/onboarding_screen.dart';
import 'screens/payout_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/publish_screen.dart';
import 'screens/ride_screen.dart';
import 'screens/shell.dart';
import 'screens/sign_in_screen.dart';
import 'screens/start_screen.dart';
import 'screens/status_screen.dart';
import 'screens/trips_screen.dart';
import 'screens/vehicle_screen.dart';
import 'screens/verify_screen.dart';

/// Lets go_router re-check its redirect whenever the session changes.
class _SessionListenable extends ChangeNotifier {
  _SessionListenable(Ref ref) {
    ref.listen(sessionProvider, (_, _) => notifyListeners());
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/',
    refreshListenable: _SessionListenable(ref),
    redirect: (context, state) {
      final session = ref.read(sessionProvider);
      final path = state.matchedLocation;
      final authPage = path == '/sign-in' || path == '/verify';
      // Until the saved token is read, stay on the start screen so no screen calls the API
      // without it (that would get a 401 and sign the driver out).
      if (!session.ready) return path == '/' ? null : '/';
      if (!session.signedIn) return authPage ? null : '/sign-in';
      if (authPage) return '/';
      return null;
    },
    routes: [
      GoRoute(path: '/', builder: (_, _) => const StartScreen()),
      GoRoute(path: '/sign-in', builder: (_, _) => const SignInScreen()),
      GoRoute(path: '/verify', builder: (_, s) => VerifyScreen(args: s.extra as VerifyArgs)),
      GoRoute(path: '/status', builder: (_, _) => const StatusScreen()),
      GoRoute(path: '/onboarding', builder: (_, _) => const OnboardingScreen(), routes: [
        GoRoute(path: 'profile', builder: (_, _) => const ProfileScreen()),
        GoRoute(path: 'payout', builder: (_, _) => const PayoutScreen()),
        GoRoute(path: 'vehicle', builder: (_, s) => VehicleScreen(vehicleId: s.uri.queryParameters['id'])),
        GoRoute(path: 'documents', builder: (_, _) => const DocumentsScreen()),
      ]),
      GoRoute(path: '/publish', builder: (_, s) => PublishScreen(prefill: s.extra as PublishPrefill?, editRideId: s.uri.queryParameters['edit'])),
      GoRoute(path: '/ride/:id', builder: (_, s) => RideScreen(rideId: s.pathParameters['id']!)),
      StatefulShellRoute.indexedStack(
        builder: (_, _, shell) => DriverShell(shell: shell),
        branches: [
          StatefulShellBranch(routes: [GoRoute(path: '/home', builder: (_, _) => const HomeScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/trips', builder: (_, _) => const TripsScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/earnings', builder: (_, _) => const EarningsScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/account', builder: (_, _) => const AccountScreen())]),
        ],
      ),
    ],
  );
});

/// Sends the driver to the right place for their review status if they are somewhere else.
/// Used by screens that only make sense for one status (tabs: approved; onboarding: draft or rejected).
void redirectIfStatusChanged(BuildContext context, DriverMe me, Set<DriverStatus> allowed) {
  if (!allowed.contains(me.status)) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (context.mounted) context.go(homeFor(me));
    });
  }
}

/// Go back, or to [fallback] when there's no history (opened from a link or after a reload).
void goBack(BuildContext context, String fallback) {
  if (context.canPop()) {
    context.pop();
  } else {
    context.go(fallback);
  }
}
