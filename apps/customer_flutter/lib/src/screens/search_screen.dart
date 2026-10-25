// Search: From and To (only towns with a route), travel date and seats, on a navy header.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:primecabs_core/primecabs_core.dart';
import 'package:primecabs_ui/primecabs_ui.dart';

import '../app_state.dart';
import '../widgets/booking_card.dart';
import '../widgets/date_strip.dart';

/// Most seats one search asks for. A booking can take every free seat (form 2.2); larger groups book twice.
const maxSearchSeats = 8;

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});
  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  String? _fromId, _toId;
  String _date = istDateString();
  int _seats = 1;
  bool _touched = false;

  bool _hasRoute(List<RouteRef> routes, String? from, String? to) => routes.any((r) => r.fromCityId == from && r.toCityId == to);

  Future<void> _pickCity({required bool from, required List<City> cities, required List<RouteRef> routes}) async {
    final options = from
        ? cities.where((c) => routes.any((r) => r.fromCityId == c.id)).toList()
        : cities.where((c) => _fromId == null ? routes.any((r) => r.toCityId == c.id) : _hasRoute(routes, _fromId, c.id)).toList();
    final picked = await showPcSheet<String>(
      context,
      title: from ? 'Leaving from' : 'Going to',
      builder: (ctx) => Column(children: [
        for (final c in options)
          ListRow(
            icon: c.isHub ? Icons.location_city : Icons.place_outlined,
            title: c.name,
            subtitle: c.isHub ? 'Hub city' : null,
            trailing: (from ? _fromId : _toId) == c.id ? const Icon(Icons.check, color: Brand.teal) : null,
            onTap: () => Navigator.pop(ctx, c.id),
          ),
        if (options.isEmpty) const Padding(padding: EdgeInsets.all(16), child: Txt.small('No routes from this town yet.')),
      ]),
    );
    if (picked == null) return;
    setState(() {
      if (from) {
        _fromId = picked;
        if (!_hasRoute(routes, _fromId, _toId)) _toId = null;
      } else {
        _toId = picked;
      }
    });
  }

  void _swap(List<RouteRef> routes) {
    if (!_hasRoute(routes, _toId, _fromId)) {
      toast(context, 'There is no route in that direction yet', error: true);
      return;
    }
    setState(() {
      final from = _fromId;
      _fromId = _toId;
      _toId = from;
    });
  }

  void _search() {
    setState(() => _touched = true);
    if (_fromId == null || _toId == null) return;
    context.push(Uri(path: '/results', queryParameters: {'from': _fromId, 'to': _toId, 'date': _date, 'seats': '$_seats'}).toString());
  }

  @override
  Widget build(BuildContext context) {
    final cities = ref.watch(citiesProvider);
    final routes = ref.watch(routesProvider);
    final config = ref.watch(configProvider).value;
    final me = ref.watch(meProvider).value;
    final next = ref.watch(bookingsProvider('upcoming')).value?.firstOrNull;
    final days = nextDays((config?.bookingHorizonDays ?? 30).clamp(1, 60));
    final top = MediaQuery.of(context).padding.top;

    final loadError = cities.error ?? routes.error;
    if (loadError != null) {
      return Scaffold(
        body: Center(
          child: ErrorView(message: errorMessage(loadError), onRetry: () => ref
            ..invalidate(citiesProvider)
            ..invalidate(routesProvider)),
        ),
      );
    }
    final cityList = cities.value ?? const <City>[];
    final routeList = routes.value ?? const <RouteRef>[];
    // Default to the hub as the starting point.
    if (_fromId == null && cityList.isNotEmpty) _fromId = cityList.firstWhere((c) => c.isHub, orElse: () => cityList.first).id;
    String? name(String? id) => cityList.where((c) => c.id == id).firstOrNull?.name;

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(bookingsProvider);
          ref.invalidate(routesProvider);
          await ref.refresh(citiesProvider.future).then<void>((_) {}, onError: (_) {});
        },
        child: ListView(padding: EdgeInsets.zero, children: [
          Container(
            color: Brand.navy,
            padding: EdgeInsets.fromLTRB(16, top + 20, 16, 20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Txt.body(me?.name == null ? 'Hello,' : 'Hello ${me!.name!.split(' ').first},', color: Colors.white70),
              const Txt.h1('Where are you going?', color: Colors.white),
              const SizedBox(height: 16),
              _FromTo(
                from: name(_fromId),
                to: name(_toId),
                toError: _touched && _toId == null,
                loading: !cities.hasValue || !routes.hasValue,
                onFrom: () => _pickCity(from: true, cities: cityList, routes: routeList),
                onTo: () => _pickCity(from: false, cities: cityList, routes: routeList),
                onSwap: _fromId != null && _toId != null ? () => _swap(routeList) : null,
              ),
              const SizedBox(height: 16),
              const Txt.label('Travel date', color: Colors.white70),
              const SizedBox(height: 8),
              DateStrip(days: days, value: _date, onNavy: true, onChanged: (d) => setState(() => _date = d)),
              const SizedBox(height: 16),
              Row(children: [
                const Expanded(child: Txt.strong('Seats', color: Colors.white)),
                _SeatCounter(value: _seats, onChanged: (v) => setState(() => _seats = v)),
              ]),
              const SizedBox(height: 16),
              Btn('Search rides', icon: Icons.search, onPressed: _search),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (next != null) ...[
                const Txt.label('Your next trip'),
                const SizedBox(height: 8),
                BookingCard(booking: next),
                const SizedBox(height: 20),
              ],
              const Txt.label('How it works'),
              const SizedBox(height: 8),
              PcCard(
                child: Column(children: [
                  _Step(icon: Icons.event_seat_outlined, title: 'Pick a ride and your seats', body: 'Fares are per seat and already include GST.'),
                  _Step(icon: Icons.timer_outlined, title: 'Pay within ${config?.seatHoldMinutes ?? 5} minutes', body: 'Your seats are held for you while you pay.'),
                  const _Step(icon: Icons.pin_outlined, title: 'Show your boarding code', body: 'Each traveller gets a code on the e-ticket. The driver enters it when you board.', last: true),
                ]),
              ),
            ]),
          ),
        ]),
      ),
    );
  }
}

class _FromTo extends StatelessWidget {
  const _FromTo({required this.from, required this.to, required this.onFrom, required this.onTo, required this.onSwap, required this.toError, required this.loading});
  final String? from, to;
  final VoidCallback onFrom, onTo;
  final VoidCallback? onSwap;
  final bool toError, loading;

  @override
  Widget build(BuildContext context) {
    final c = context.pc;
    Widget row(String label, String? value, String empty, IconData icon, VoidCallback onTap, {bool error = false}) => InkWell(
          onTap: loading ? null : onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(children: [
              Icon(icon, color: Brand.tealDark, size: 22),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Txt.caption(label),
                  Text(
                    value ?? (loading ? 'Loading…' : empty),
                    style: TextStyle(fontSize: 17, fontWeight: value == null ? FontWeight.w400 : FontWeight.w600, color: error ? c.danger : (value == null ? c.textMuted : c.text)),
                  ),
                ]),
              ),
            ]),
          ),
        );
    return Material(
      color: c.card,
      borderRadius: BorderRadius.circular(14),
      clipBehavior: Clip.antiAlias,
      child: Stack(children: [
        Column(children: [
          row('From', from, 'Choose a town', Icons.trip_origin, onFrom),
          Divider(height: 1, indent: 50, color: c.border),
          row('To', to, 'Choose where you are going', Icons.place, onTo, error: toError),
        ]),
        Positioned(
          right: 12,
          top: 0,
          bottom: 0,
          child: Center(
            child: Semantics(
              button: true,
              label: 'Swap From and To',
              child: Material(
                color: c.cardMuted,
                shape: CircleBorder(side: BorderSide(color: c.border)),
                child: IconButton(onPressed: onSwap, icon: const Icon(Icons.swap_vert), color: Brand.navy, tooltip: 'Swap'),
              ),
            ),
          ),
        ),
      ]),
    );
  }
}

class _SeatCounter extends StatelessWidget {
  const _SeatCounter({required this.value, required this.onChanged});
  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    Widget btn(IconData icon, int next, String label) => IconButton(
          tooltip: label,
          onPressed: next < 1 || next > maxSearchSeats ? null : () => onChanged(next),
          icon: Icon(icon),
          color: Colors.white,
          disabledColor: Colors.white30,
          style: IconButton.styleFrom(side: const BorderSide(color: Colors.white38), minimumSize: const Size(tapTarget, tapTarget)),
        );
    return Row(children: [
      btn(Icons.remove, value - 1, 'Fewer seats'),
      SizedBox(width: 44, child: Text('$value', textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700))),
      btn(Icons.add, value + 1, 'More seats'),
    ]);
  }
}

class _Step extends StatelessWidget {
  const _Step({required this.icon, required this.title, required this.body, this.last = false});
  final IconData icon;
  final String title, body;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final c = context.pc;
    return Padding(
      padding: EdgeInsets.only(bottom: last ? 0 : 14),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(width: 36, height: 36, decoration: BoxDecoration(color: c.primarySoft, borderRadius: BorderRadius.circular(10)), child: Icon(icon, size: 20, color: c.accentText)),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Txt.strong(title), Txt.small(body)])),
      ]),
    );
  }
}
