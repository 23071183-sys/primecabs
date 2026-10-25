// Shown while the profile is under review, or when the account is suspended.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:primecabs_core/primecabs_core.dart';
import 'package:primecabs_ui/primecabs_ui.dart';

import '../app_state.dart';
import '../router.dart';
import '../widgets/call.dart';

class StatusScreen extends ConsumerWidget {
  const StatusScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.pc;
    final me = ref.watch(meProvider).value;
    final config = ref.watch(configProvider).value;
    if (me != null) redirectIfStatusChanged(context, me, {DriverStatus.pending, DriverStatus.suspended});
    final suspended = me?.status == DriverStatus.suspended;

    return Scaffold(
      body: Column(children: [
        Container(
          width: double.infinity,
          color: Brand.navy,
          padding: EdgeInsets.fromLTRB(20, MediaQuery.of(context).padding.top + 20, 20, 28),
          child: Column(children: [
            CircleAvatar(
              radius: 32,
              backgroundColor: suspended ? c.danger : Brand.teal,
              child: Icon(suspended ? Icons.lock : Icons.hourglass_top, size: 30, color: suspended ? Colors.white : Brand.onTeal),
            ),
            const SizedBox(height: 12),
            Txt.h2(suspended ? 'Your account is suspended' : "We're checking your documents", color: Colors.white, align: TextAlign.center),
            const SizedBox(height: 6),
            Txt.body(
              suspended ? "You can't publish rides right now." : "Most drivers are approved the same day. We'll let you know as soon as it's done.",
              color: Colors.white.withValues(alpha: 0.8),
              align: TextAlign.center,
            ),
          ]),
        ),
        Expanded(
          child: PcScreen(
            onRefresh: () async => ref.refresh(meProvider.future),
            children: [
              if (suspended && me?.rejectionReason != null) PcBanner(tone: Tone.danger, title: 'Reason', body: me!.rejectionReason!),
              if (!suspended)
                PcCard(
                  child: Column(children: [
                    for (final (icon, label, done) in [
                      (Icons.check_circle, 'Details and documents sent', true),
                      (Icons.search, 'PrimeCabs checks your documents', false),
                      (Icons.directions_car, 'You publish your first ride', false),
                    ])
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        child: Row(children: [
                          Icon(icon, color: done ? c.success : c.textMuted),
                          const SizedBox(width: 12),
                          done ? Txt.strong(label) : Txt.body(label, color: c.textSecondary),
                        ]),
                      ),
                  ]),
                ),
              const Txt.small('Pull down to check for updates.', align: TextAlign.center),
              if (config != null)
                PcCard(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    const Txt.strong('Need help?'),
                    const SizedBox(height: 4),
                    const Txt.small('Call PrimeCabs support, 24 hours a day.'),
                    const SizedBox(height: 12),
                    Btn('Call ${config.supportPhone}', kind: BtnKind.secondary, icon: Icons.call, onPressed: () => callNumber(config.supportPhone)),
                  ]),
                ),
              Btn('Sign out', kind: BtnKind.ghost, onPressed: () => ref.read(sessionProvider.notifier).signOut()),
            ],
          ),
        ),
      ]),
    );
  }
}
