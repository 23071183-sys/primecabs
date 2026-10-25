// Onboarding hub: four steps, each saved as you go. Submit sends the profile for review.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:primecabs_core/primecabs_core.dart';
import 'package:primecabs_ui/primecabs_ui.dart';

import '../app_state.dart';
import '../router.dart';

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});
  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  bool _busy = false;
  String? _submitError;

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _submitError = null;
    });
    try {
      await ref.read(apiProvider).post('/driver/submit');
      ref.invalidate(meProvider);
      if (mounted) context.go('/status');
    } on ApiError catch (e) {
      setState(() => _submitError = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pc;
    final meAsync = ref.watch(meProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Get verified'), automaticallyImplyLeading: false),
      body: meAsync.when(
        loading: () => PcScreen(children: [for (var i = 0; i < 4; i++) const Skeleton(height: 72)]),
        error: (e, _) => ErrorView(message: errorMessage(e), onRetry: () => ref.invalidate(meProvider)),
        data: (me) {
          redirectIfStatusChanged(context, me, {DriverStatus.draft, DriverStatus.rejected});
          final docsMissing = me.missingDocuments.length;
          final hasVehicle = me.vehicles.isNotEmpty;
          final steps = [
            (Icons.person_outline, 'Your details', '/onboarding/profile', me.name != null && me.homeCityId != null,
                me.name != null ? '${me.name}${me.homeCityName != null ? ' · ${me.homeCityName}' : ''}' : 'Name, age and home city', null),
            (Icons.account_balance_wallet_outlined, 'How you get paid', '/onboarding/payout', me.hasPayout,
                me.bankLast4 != null ? 'Bank account ••${me.bankLast4}' : (me.upiId != null ? 'UPI ${me.upiId}' : 'Bank account or UPI ID'), null),
            (Icons.directions_car_outlined, 'Your vehicle', '/onboarding/vehicle', hasVehicle,
                hasVehicle ? me.vehicles.map((v) => '${v.make} ${v.model} · ${v.registrationNo}').join(', ') : 'Type, number and plate colour', null),
            (Icons.description_outlined, 'Documents', '/onboarding/documents', hasVehicle && docsMissing == 0,
                !hasVehicle ? 'Licence, Aadhaar, RC and more' : (docsMissing > 0 ? '$docsMissing still to upload' : 'All uploaded'), hasVehicle ? null : 'Add your vehicle first'),
          ];
          final done = steps.where((s) => s.$4).length;
          final allDone = done == steps.length;

          return PcScreen(
            onRefresh: () async => ref.refresh(meProvider.future),
            footer: Column(mainAxisSize: MainAxisSize.min, children: [
              Btn('Send for review', icon: Icons.send, loading: _busy, onPressed: allDone ? _submit : null),
              if (!allDone) ...[const SizedBox(height: 6), Txt.caption('Finish all ${steps.length} steps to send your profile.', align: TextAlign.center)],
            ]),
            children: [
              if (me.status == DriverStatus.rejected && me.rejectionReason != null)
                PcBanner(tone: Tone.danger, title: 'Please fix and send again', body: me.rejectionReason!),
              const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Txt.h2('Become a PrimeCabs driver'),
                SizedBox(height: 6),
                Txt.small('Your progress is saved after every step. Approval usually happens the same day.'),
              ]),
              PcCard(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Txt.strong('$done of ${steps.length} done')),
                    if (allDone) const StatusChip('Ready to send', tone: Tone.success, icon: Icons.check),
                  ]),
                  const SizedBox(height: 8),
                  Row(children: [
                    for (var i = 0; i < steps.length; i++) ...[
                      if (i > 0) const SizedBox(width: 4),
                      Expanded(child: Container(height: 6, decoration: BoxDecoration(color: steps[i].$4 ? Brand.teal : c.border, borderRadius: BorderRadius.circular(3)))),
                    ],
                  ]),
                ]),
              ),
              PcCard(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                child: Column(children: [
                  for (var i = 0; i < steps.length; i++) ...[
                    if (i > 0) const Divider(),
                    ListRow(
                      icon: steps[i].$1,
                      title: steps[i].$2,
                      subtitle: steps[i].$6 ?? steps[i].$5,
                      trailing: steps[i].$4 ? Icon(Icons.check_circle, color: c.success) : null,
                      onTap: steps[i].$6 != null ? null : () => context.push(steps[i].$3),
                    ),
                  ],
                ]),
              ),
              if (_submitError != null) PcBanner(tone: Tone.warning, body: _submitError!),
              Btn('Sign out', kind: BtnKind.ghost, onPressed: () => ref.read(sessionProvider.notifier).signOut()),
            ],
          );
        },
      ),
    );
  }
}
