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

const _tokenKey = 'pc_driver_token';

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

final meProvider = FutureProvider<DriverMe>((ref) async {
  final api = ref.watch(apiProvider);
  return DriverMe.fromJson(await api.get('/driver/me') as Json);
});

final configProvider = FutureProvider<PublicConfig>((ref) async => PublicConfig.fromJson(await ref.watch(apiProvider).get('/config') as Json));

final citiesProvider = FutureProvider<List<City>>((ref) async {
  final list = await ref.watch(apiProvider).get('/cities') as List;
  return list.map((e) => City.fromJson(e as Json)).toList();
});

final routesProvider = FutureProvider<List<RouteRef>>((ref) async {
  final list = await ref.watch(apiProvider).get('/routes') as List;
  return list.map((e) => RouteRef.fromJson(e as Json)).toList();
});

final vehicleTypesProvider = FutureProvider<List<VehicleType>>((ref) async {
  final list = await ref.watch(apiProvider).get('/vehicle-types') as List;
  return list.map((e) => VehicleType.fromJson(e as Json)).toList();
});

/// "upcoming" or "past"
final ridesProvider = FutureProvider.family<List<DriverRide>, String>((ref, scope) async {
  final list = await ref.watch(apiProvider).get('/driver/rides', query: {'scope': scope}) as List;
  return list.map((e) => DriverRide.fromJson(e as Json)).toList();
});

final rideProvider = FutureProvider.family<RideDetail, String>((ref, id) async => RideDetail.fromJson(await ref.watch(apiProvider).get('/driver/rides/$id') as Json));

final earningsProvider = FutureProvider<Earnings>((ref) async => Earnings.fromJson(await ref.watch(apiProvider).get('/driver/earnings') as Json));

typedef FareQuery = ({String routeId, String vehicleId, int? seatFare});

final referenceFareProvider = FutureProvider.family<ReferenceFare, FareQuery>((ref, q) async {
  final j = await ref.watch(apiProvider).get('/driver/reference-fare', query: {'routeId': q.routeId, 'vehicleId': q.vehicleId, 'seatFare': q.seatFare});
  return ReferenceFare.fromJson(j as Json);
});

/// After any change to rides or bookings, refresh everything that shows them.
void refreshRides(WidgetRef ref, {String? rideId}) {
  ref.invalidate(ridesProvider);
  ref.invalidate(earningsProvider);
  if (rideId != null) ref.invalidate(rideProvider(rideId));
}

/// Where a signed-in driver belongs, based on their review status.
String homeFor(DriverMe me) => switch (me.status) {
      DriverStatus.approved => '/home',
      DriverStatus.draft || DriverStatus.rejected => '/onboarding',
      _ => '/status',
    };
