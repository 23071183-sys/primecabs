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
    final me = ref.watch(meProvider);
    final config = ref.watch(configProvider).value;
    final c = context.pc;
    return Scaffold(
      appBar: AppBar(title: const Text('Account')),
      body: PcScreen(
        onRefresh: () async => ref.refresh(meProvider.future).then<void>((_) {}, onError: (_) {}),
        children: [
          me.when(
            loading: () => const Skeleton(height: 84, radius: 14),
            error: (e, _) => ErrorView(message: errorMessage(e), onRetry: () => ref.invalidate(meProvider)),
            data: (m) => PcCard(
              onTap: () => context.push('/profile'),
              child: Row(children: [
                CircleAvatar(radius: 26, backgroundColor: Brand.teal, foregroundColor: Brand.onTeal, child: Text(initials(m.name), style: const TextStyle(fontWeight: FontWeight.w700))),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Txt.title(m.name ?? 'Add your name'),
                    Txt.small([phone(m.phone), if (m.email != null) m.email!].join(' · ')),
                  ]),
                ),
                Icon(Icons.chevron_right, color: c.textMuted),
              ]),
            ),
          ),
          if (config != null && config.refundPolicy.isNotEmpty) ...[
            const Txt.label('Cancellation and refunds'),
            PcCard(
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                for (final p in config.refundPolicy) Padding(padding: const EdgeInsets.symmetric(vertical: 3), child: Txt.body(p.label)),
                const SizedBox(height: 6),
                const Txt.small('Counted from the departure time. If the driver or PrimeCabs cancels, you get 100% back.'),
              ]),
            ),
          ],
          const Txt.label('Help'),
          PcCard(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: Column(children: [
              ListRow(icon: Icons.support_agent, title: 'Call PrimeCabs support', subtitle: config == null ? null : '${phone(config.supportPhone)} · 24 hours', onTap: config == null ? null : () => callNumber(config.supportPhone)),
              ListRow(icon: Icons.mail_outline, title: 'Email support', subtitle: config?.supportEmail, onTap: config == null ? null : () => sendEmail(config.supportEmail)),
            ]),
          ),
          Btn('Sign out', kind: BtnKind.danger, icon: Icons.logout, onPressed: () => ref.read(sessionProvider.notifier).signOut()),
          const Txt.caption('PrimeCabs', align: TextAlign.center),
        ],
      ),
    );
  }
}
