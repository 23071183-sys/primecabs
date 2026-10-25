import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:primecabs_core/primecabs_core.dart';
import 'package:primecabs_ui/primecabs_ui.dart';

import '../app_state.dart';
import '../widgets/ride_card.dart';

String _greeting() {
  final h = DateTime.now().toUtc().add(const Duration(minutes: 330)).hour;
  return h < 12 ? 'Good morning' : (h < 17 ? 'Good afternoon' : 'Good evening');
}

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(meProvider).value;
    final rides = ref.watch(ridesProvider('upcoming'));
    final earnings = ref.watch(earningsProvider).value;
    final hasApprovedVehicle = (me?.approvedVehicles.length ?? 0) > 0;

    Widget stat(String label, int? value) => Expanded(
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(14)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Txt.caption(label, color: Colors.white.withValues(alpha: 0.7)),
              const SizedBox(height: 2),
              value == null ? const Skeleton(height: 22, width: 80) : Txt.title(inr(value), color: Colors.white),
            ]),
          ),
        );

    return Column(children: [
      Container(
        color: Brand.navy,
        padding: EdgeInsets.fromLTRB(16, MediaQuery.of(context).padding.top + 12, 16, 20),
        child: Column(children: [
          Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Txt.small('${_greeting()},', color: Colors.white.withValues(alpha: 0.75)),
                Txt.h2(me?.name?.split(' ').first ?? 'Driver', color: Colors.white),
              ]),
            ),
            const StatusChip('Verified', tone: Tone.success, icon: Icons.verified_user),
          ]),
          const SizedBox(height: 16),
          Row(children: [
            stat('Earned, last 7 days', earnings?.last7Days),
            const SizedBox(width: 8),
            stat('From upcoming bookings', earnings?.upcoming),
          ]),
        ]),
      ),
      Expanded(
        child: PcScreen(
          onRefresh: () async {
            ref.invalidate(earningsProvider);
            await ref.refresh(ridesProvider('upcoming').future).then<void>((_) {}, onError: (_) {}); // errors show on the screen itself
          },
          children: [
            if (me != null && !hasApprovedVehicle)
              const PcBanner(tone: Tone.warning, title: 'No approved vehicle', body: "Your vehicle is waiting for review. You can publish rides once it's approved.")
            else
              Btn('Publish a ride', icon: Icons.add_circle, onPressed: () => context.push('/publish')),
            const Txt.label('Upcoming'),
            ...rides.when(
              loading: () => [for (var i = 0; i < 2; i++) const Skeleton(height: 120, radius: 14)],
              error: (e, _) => [ErrorView(message: errorMessage(e), onRetry: () => ref.invalidate(ridesProvider('upcoming')))],
              data: (list) {
                final active = list.where((r) => r.status != RideStatus.cancelled).toList();
                if (active.isEmpty) {
                  return [
                    const EmptyView(
                      icon: Icons.directions_car_outlined,
                      title: 'No rides published',
                      body: 'Publish a ride with your route, time and fare. PrimeCabs reviews the fare, then customers can book seats.',
                    ),
                  ];
                }
                return [for (final r in active) RideCard(ride: r)];
              },
            ),
          ],
        ),
      ),
    ]);
  }
}
