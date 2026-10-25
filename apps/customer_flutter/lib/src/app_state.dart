// Session (token in secure storage), the API client, and the data the screens share.
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:primecabs_core/primecabs_core.dart';

/// Where the API lives. Set with `--dart-define=API_URL=https://primecabs-api.onrender.com`.
/// Without it, development builds use this computer: the web preview's host, the Android
/// emulator's alias for the host (10.0.2.2), or localhost for the iPhone Simulator.
String apiBaseUrl() {
  const fromBuild = String.fromEnvironment('API_URL');
  if (fromBuild.isNotEmpty) return fromBuild;
  if (kIsWeb) return '${Uri.base.scheme}://${Uri.base.host}:4000';
  if (defaultTargetPlatform == TargetPlatform.android) return 'http://10.0.2.2:4000';
  return 'http://localhost:4000';
}

const _tokenKey = 'pc_customer_token';

class Session {
  const Session({required this.ready, this.token});
  final bool ready;
  final String? token;
  bool get signedIn => token != null;
}

class SessionNotifier extends Notifier<Session> {
  final _storage = const FlutterSecureStorage();

  @override
  Session build() {
    _restore();
    return const Session(ready: false);
  }

  Future<void> _restore() async {
    String? token;
    try {
      token = await _storage.read(key: _tokenKey);
    } catch (_) {
      token = null; // storage unavailable: start signed out
    }
    state = Session(ready: true, token: token);
  }

  Future<void> signIn(String token) async {
    try {
      await _storage.write(key: _tokenKey, value: token);
    } catch (_) {/* session lasts until the app closes */}
    state = Session(ready: true, token: token);
  }

  Future<void> signOut() async {
    try {
      await _storage.delete(key: _tokenKey);
    } catch (_) {}
    state = const Session(ready: true);
  }
}

final sessionProvider = NotifierProvider<SessionNotifier, Session>(SessionNotifier.new);

final apiProvider = Provider<ApiClient>((ref) {
  final session = ref.watch(sessionProvider);
  return ApiClient(
    baseUrl: apiBaseUrl(),
    token: session.token,
    // A 401 means the token is no longer valid: sign out so the router shows sign-in.
    onUnauthorized: () => ref.read(sessionProvider.notifier).signOut(),
  );
});

// ---- Data ----

final meProvider = FutureProvider<CustomerMe>((ref) async => CustomerMe.fromJson(await ref.watch(apiProvider).get('/me') as Json));

final configProvider = FutureProvider<PublicConfig>((ref) async => PublicConfig.fromJson(await ref.watch(apiProvider).get('/config') as Json));

final citiesProvider = FutureProvider<List<City>>((ref) async {
  final list = await ref.watch(apiProvider).get('/cities') as List;
  return list.map((e) => City.fromJson(e as Json)).toList();
});

final routesProvider = FutureProvider<List<RouteRef>>((ref) async {
  final list = await ref.watch(apiProvider).get('/routes') as List;
  return list.map((e) => RouteRef.fromJson(e as Json)).toList();
});

typedef SearchQuery = ({String fromCityId, String toCityId, String date, int seats});

final searchProvider = FutureProvider.autoDispose.family<SearchResult, SearchQuery>((ref, q) async {
  final j = await ref.watch(apiProvider).get('/rides/search', query: {'fromCityId': q.fromCityId, 'toCityId': q.toCityId, 'date': q.date, 'seats': q.seats});
  return SearchResult.fromJson(j as Json);
});

final rideProvider = FutureProvider.autoDispose.family<BookableRide, String>((ref, id) async => BookableRide.fromJson(await ref.watch(apiProvider).get('/rides/$id') as Json));

/// "upcoming", "past" or "cancelled"
final bookingsProvider = FutureProvider.family<List<BookingSummary>, String>((ref, tab) async {
  final j = await ref.watch(apiProvider).get('/bookings', query: {'tab': tab, 'limit': 50}) as Json;
  return (j['items'] as List).map((e) => BookingSummary.fromJson(e as Json)).toList();
});

final ticketProvider = FutureProvider.autoDispose.family<Ticket, String>((ref, id) async => Ticket.fromJson(await ref.watch(apiProvider).get('/bookings/$id') as Json));

/// After a booking is created, paid or cancelled, refresh everything that shows it.
void refreshBookings(WidgetRef ref, {String? bookingId}) {
  ref.invalidate(bookingsProvider);
  if (bookingId != null) ref.invalidate(ticketProvider(bookingId));
}
