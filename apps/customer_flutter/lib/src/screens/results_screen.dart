// Rides on a route for one day. Full or not-yet-open rides stay in the list, greyed out.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:primecabs_core/primecabs_core.dart';
import 'package:primecabs_ui/primecabs_ui.dart';

import '../app_state.dart';
import '../widgets/booking_card.dart';
import '../widgets/date_strip.dart';

class ResultsScreen extends ConsumerStatefulWidget {
  const ResultsScreen({super.key, required this.fromCityId, required this.toCityId, required this.date, required this.seats});
  final String fromCityId, toCityId, date;
  final int seats;

  @override
  ConsumerState<ResultsScreen> createState() => _ResultsScreenState();
}

class _ResultsScreenState extends ConsumerState<ResultsScreen> {
  late String _date = widget.date;

  @override
  Widget build(BuildContext context) {
    final cities = ref.watch(citiesProvider).value ?? const <City>[];
    final config = ref.watch(configProvider).value;
    String name(String id) => cities.where((c) => c.id == id).firstOrNull?.name ?? '';
    final q = (fromCityId: widget.fromCityId, toCityId: widget.toCityId, date: _date, seats: widget.seats);
    final result = ref.watch(searchProvider(q));
    final days = nextDays((config?.bookingHorizonDays ?? 30).clamp(1, 60));

    return Scaffold(
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          RouteTitle(name(widget.fromCityId), name(widget.toCityId), color: Colors.white),
          Text('${widget.seats} seat${widget.seats > 1 ? 's' : ''}', style: const TextStyle(fontSize: 13, color: Colors.white70)),
        ]),
      ),
      body: PcScreen(
        onRefresh: () async => ref.refresh(searchProvider(q).future).then<void>((_) {}, onError: (_) {}),
        children: [
          DateStrip(days: days, value: _date, onChanged: (d) => setState(() => _date = d)),
          ...result.when(
            loading: () => [for (var i = 0; i < 3; i++) const Skeleton(height: 132, radius: 14)],
            error: (e, _) => [ErrorView(message: errorMessage(e), onRetry: () => ref.invalidate(searchProvider(q)))],
            data: (r) {
              if (r.items.isEmpty) {
                return [
                  EmptyView(
                    icon: Icons.event_busy_outlined,
                    title: r.routeExists ? 'No rides on this day' : 'No rides on this route yet',
                    body: r.routeExists ? 'Try another date. Drivers publish rides up to a few days ahead.' : 'PrimeCabs is adding routes from Nagpur. Check back soon.',
                  ),
                ];
              }
              final open = r.items.where((x) => x.available).length;
              return [
                Txt.small('$open of ${r.items.length} ride${r.items.length > 1 ? 's' : ''} can be booked${r.distanceKm == null ? '' : ' · ${r.distanceKm} km'}'),
                for (final ride in r.items) _RideTile(ride: ride, seats: widget.seats, gstIncluded: config?.gstIncluded ?? true),
              ];
            },
          ),
        ],
      ),
    );
  }
}

class _RideTile extends StatelessWidget {
  const _RideTile({required this.ride, required this.seats, required this.gstIncluded});
  final RideOption ride;
  final int seats;
  final bool gstIncluded;

  String get _why => switch (ride.unavailableReason) {
        'FULL' => 'Full',
        'NOT_ENOUGH_SEATS' => 'Only ${ride.availableSeats} left',
        'BOOKING_NOT_OPEN' => 'Opens later',
        _ => 'Unavailable',
      };

  @override
  Widget build(BuildContext context) {
    final c = context.pc;
    final dim = !ride.available;
    final few = ride.available && ride.availableSeats <= 2;
    return Opacity(
      opacity: dim ? 0.55 : 1,
      child: PcCard(
        onTap: dim ? null : () => context.push('/book/${ride.id}?seats=$seats'),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            // Departure → arrival timeline
            Expanded(
              child: Row(children: [
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Txt.title(time(ride.departureAt)),
                  Txt.caption('Departs'),
                ]),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    child: Column(children: [
                      Txt.caption(duration(ride.durationMinutes)),
                      Row(children: [
                        Container(width: 6, height: 6, decoration: const BoxDecoration(color: Brand.teal, shape: BoxShape.circle)),
                        Expanded(child: Container(height: 1.5, color: c.borderStrong)),
                        Container(width: 6, height: 6, decoration: BoxDecoration(border: Border.all(color: c.textMuted, width: 1.5), shape: BoxShape.circle)),
                      ]),
                    ]),
                  ),
                ),
                Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                  Txt.title(time(ride.arrivalAt)),
                  Txt.caption('Arrives'),
                ]),
              ]),
            ),
          ]),
          const SizedBox(height: 12),
          Divider(height: 1, color: c.border),
          const SizedBox(height: 12),
          Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Txt.small('${shortVehicle(ride.vehicleType)} · ${ride.driverFirstName}'),
                const SizedBox(height: 6),
                dim
                    ? StatusChip(_why)
                    : StatusChip('${ride.availableSeats} seat${ride.availableSeats > 1 ? 's' : ''} left', tone: few ? Tone.warning : Tone.success, icon: Icons.event_seat),
              ]),
            ),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Txt.h2(inr(ride.seatFare)),
              Txt.caption(gstIncluded ? 'per seat · GST included' : 'per seat + GST'),
            ]),
          ]),
        ]),
      ),
    );
  }
}
