import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:primecabs_core/primecabs_core.dart';
import 'package:primecabs_ui/primecabs_ui.dart';

import '../app_state.dart';

class EarningsScreen extends ConsumerWidget {
  const EarningsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.pc;
    final summary = ref.watch(earningsProvider);
    final past = ref.watch(ridesProvider('past'));
    final paid = (past.value ?? const <DriverRide>[]).where((r) => r.status == RideStatus.completed && r.earnings > 0).toList();

    Widget tile(String label, int? value) => Expanded(
          child: PcCard(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Txt.small(label),
              const SizedBox(height: 4),
              value == null ? const Skeleton(height: 26, width: 90) : Txt.h2(inr(value)),
            ]),
          ),
        );

    return Scaffold(
      appBar: AppBar(title: const Text('Earnings')),
      body: PcScreen(
        onRefresh: () async {
          ref.invalidate(ridesProvider('past'));
          await ref.refresh(earningsProvider.future).then<void>((_) {}, onError: (_) {}); // errors show on the screen itself
        },
        children: [
          if (summary.hasError)
            ErrorView(message: errorMessage(summary.error!), onRetry: () => ref.invalidate(earningsProvider))
          else
            Row(children: [tile('Last 7 days', summary.value?.last7Days), const SizedBox(width: 8), tile('Last 30 days', summary.value?.last30Days)]),
          if (summary.value != null)
            PcCard(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                InfoRow('From confirmed bookings, not yet driven', inr(summary.value!.upcoming), strong: true),
                InfoRow('Seats sold, last 7 days', '${summary.value!.seatsSoldLast7Days}'),
                const SizedBox(height: 6),
                const Txt.caption('Amounts are what you keep after GST and the PrimeCabs fee. PrimeCabs pays completed trips to your bank account or UPI.'),
              ]),
            ),
          const Txt.label('Completed trips'),
          if (past.isLoading)
            const Skeleton(height: 64)
          else if (paid.isEmpty)
            const EmptyView(icon: Icons.account_balance_wallet_outlined, title: 'No earnings yet', body: 'When you finish a trip, what you earned appears here.')
          else
            PcCard(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Column(children: [
                for (var i = 0; i < paid.length; i++) ...[
                  if (i > 0) const Divider(),
                  InkWell(
                    onTap: () => context.push('/ride/${paid[i].id}'),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Row(children: [
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Txt.strong('${paid[i].from} → ${paid[i].to}'),
                            Txt.small('${dayLabel(paid[i].departureAt)} · ${paid[i].seatsSold} seats'),
                          ]),
                        ),
                        Txt.strong(inr(paid[i].earnings), color: c.success),
                      ]),
                    ),
                  ),
                ],
              ]),
            ),
        ],
      ),
    );
  }
}
