import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'app_state.dart';
import 'screens/account_screen.dart';
import 'screens/book_screen.dart';
import 'screens/bookings_screen.dart';
import 'screens/pay_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/results_screen.dart';
import 'screens/search_screen.dart';
import 'screens/shell.dart';
import 'screens/sign_in_screen.dart';
import 'screens/start_screen.dart';
import 'screens/ticket_screen.dart';
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
      // without it (that would get a 401 and sign the customer out).
      if (!session.ready) return path == '/' ? null : '/';
      if (!session.signedIn) return authPage ? null : '/sign-in';
      if (authPage) return '/';
      return null;
    },
    routes: [
      GoRoute(path: '/', builder: (_, _) => const StartScreen()),
      GoRoute(path: '/sign-in', builder: (_, _) => const SignInScreen()),
      GoRoute(path: '/verify', builder: (_, s) => VerifyScreen(args: s.extra as VerifyArgs)),
      GoRoute(path: '/profile', builder: (_, s) => ProfileScreen(firstTime: s.uri.queryParameters['first'] == '1')),
      GoRoute(
        path: '/results',
        builder: (_, s) {
          final q = s.uri.queryParameters;
          return ResultsScreen(fromCityId: q['from']!, toCityId: q['to']!, date: q['date']!, seats: int.tryParse(q['seats'] ?? '') ?? 1);
        },
      ),
      GoRoute(path: '/book/:rideId', builder: (_, s) => BookScreen(rideId: s.pathParameters['rideId']!, seats: int.tryParse(s.uri.queryParameters['seats'] ?? '') ?? 1)),
      GoRoute(path: '/pay/:id', builder: (_, s) => PayScreen(bookingId: s.pathParameters['id']!)),
      GoRoute(path: '/ticket/:id', builder: (_, s) => TicketScreen(bookingId: s.pathParameters['id']!)),
      StatefulShellRoute.indexedStack(
        builder: (_, _, shell) => CustomerShell(shell: shell),
        branches: [
          StatefulShellBranch(routes: [GoRoute(path: '/search', builder: (_, _) => const SearchScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/bookings', builder: (_, _) => const BookingsScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/account', builder: (_, _) => const AccountScreen())]),
        ],
      ),
    ],
  );
});

/// Go back, or to [fallback] when there's no history (opened from a link or after a reload).
void goBack(BuildContext context, String fallback) {
  if (context.canPop()) {
    context.pop();
  } else {
    context.go(fallback);
  }
}
