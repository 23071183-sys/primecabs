import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:primecabs_core/primecabs_core.dart';
import 'package:primecabs_ui/primecabs_ui.dart';

import '../app_state.dart';
import '../widgets/call.dart';

class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.pc;
    final me = ref.watch(meProvider).value;
    final config = ref.watch(configProvider).value;
    if (me == null) return const Scaffold(body: Center(child: CircularProgressIndicator(color: Brand.teal)));
    final missing = me.missingDocuments.length;

    Widget section(List<Widget> rows) => PcCard(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          child: Column(children: [for (var i = 0; i < rows.length; i++) ...[if (i > 0) const Divider(), rows[i]]]),
        );

    return Scaffold(
      appBar: AppBar(title: const Text('Account')),
      body: PcScreen(children: [
        PcCard(
          child: Row(children: [
            CircleAvatar(radius: 26, backgroundColor: Brand.teal, child: Txt.title(initials(me.name), color: Brand.onTeal)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Txt.title(me.name ?? 'Driver'),
                Txt.small('${phone(me.phone)}${me.homeCityName != null ? ' · ${me.homeCityName}' : ''}'),
              ]),
            ),
          ]),
        ),
        const Txt.label('Vehicles'),
        section([
          for (final v in me.vehicles)
            ListRow(
              icon: Icons.directions_car_outlined,
              title: '${v.make} ${v.model}',
              subtitle: '${v.registrationNo} · ${v.passengerSeats} seats · ${v.yellowPlate ? 'yellow' : 'white'} plate',
              trailing: StatusChip(
                switch (v.status) { ReviewStatus.approved => 'Approved', ReviewStatus.rejected => 'Rejected', _ => 'In review' },
                tone: switch (v.status) { ReviewStatus.approved => Tone.success, ReviewStatus.rejected => Tone.danger, _ => Tone.warning },
              ),
              onTap: () => context.push('/onboarding/vehicle?id=${v.id}'),
            ),
          ListRow(icon: Icons.add_circle_outline, title: 'Add another vehicle', onTap: () => context.push('/onboarding/vehicle')),
        ]),
        const Txt.label('Profile'),
        section([
          ListRow(
            icon: Icons.description_outlined,
            title: 'Documents',
            subtitle: missing > 0 ? '$missing needed' : 'All uploaded',
            trailing: missing > 0 ? const StatusChip('Action needed', tone: Tone.warning) : null,
            onTap: () => context.push('/onboarding/documents'),
          ),
          ListRow(
            icon: Icons.account_balance_wallet_outlined,
            title: 'Payout details',
            subtitle: me.bankLast4 != null ? 'Bank account ••${me.bankLast4}' : (me.upiId != null ? 'UPI ${me.upiId}' : 'Not added'),
            onTap: () => context.push('/onboarding/payout'),
          ),
          ListRow(icon: Icons.person_outline, title: 'Your details', subtitle: 'Name, age, home city', onTap: () => context.push('/onboarding/profile')),
        ]),
        if (config != null) ...[
          const Txt.label('Help'),
          section([
            ListRow(icon: Icons.call_outlined, title: 'Call PrimeCabs support', subtitle: '${config.supportPhone} · 24 hours', onTap: () => callNumber(config.supportPhone)),
          ]),
        ],
        Btn('Sign out', kind: BtnKind.danger, icon: Icons.logout, onPressed: () => ref.read(sessionProvider.notifier).signOut()),
        Txt.caption('PrimeCabs Driver', color: c.textMuted, align: TextAlign.center),
      ]),
    );
  }
}
