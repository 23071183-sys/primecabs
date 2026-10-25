// E-ticket (form 6.5): booking code, ride, pickup and drop, driver and car, each traveller's
// boarding code, fare breakup and support. Share as text, or cancel with the refund shown first.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:primecabs_core/primecabs_core.dart';
import 'package:primecabs_ui/primecabs_ui.dart';
import 'package:share_plus/share_plus.dart';

import '../app_state.dart';
import '../widgets/booking_card.dart';
import '../widgets/call.dart';
import '../widgets/fare_summary.dart';

class TicketScreen extends ConsumerWidget {
  const TicketScreen({super.key, required this.bookingId});
  final String bookingId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ticket = ref.watch(ticketProvider(bookingId));
    return Scaffold(
      appBar: AppBar(
        title: const Text('E-ticket'),
        actions: [
          if (ticket.value case final t? when t.status == BookingStatus.confirmed)
            IconButton(tooltip: 'Share ticket', icon: const Icon(Icons.ios_share), onPressed: () => SharePlus.instance.share(ShareParams(text: shareText(t), subject: 'PrimeCabs ${t.code}'))),
        ],
      ),
      body: ticket.when(
        loading: () => const PcScreen(children: [Skeleton(height: 160, radius: 14), Skeleton(height: 140, radius: 14), Skeleton(height: 120, radius: 14)]),
        error: (e, _) => PcScreen(children: [ErrorView(message: errorMessage(e), onRetry: () => ref.invalidate(ticketProvider(bookingId)))]),
        data: (t) => _TicketBody(ticket: t),
      ),
    );
  }
}

/// Plain-text ticket for WhatsApp or SMS (form 6.6). Boarding codes are left out on purpose.
String shareText(Ticket t) => [
      'PrimeCabs booking ${t.code}',
      '${t.from} → ${t.to}',
      '${dayLabel(t.departureAt)}, ${time(t.departureAt)} (arrives ${time(t.arrivalAt)})',
      'Pickup: ${t.pickup.label}',
      'Drop: ${t.drop.label}',
      if (t.vehicleNo != null) 'Car: ${t.vehicleName?.isNotEmpty == true ? '${t.vehicleName} · ' : ''}${t.vehicleNo}',
      if (t.driverName != null) 'Driver: ${t.driverName}',
      'Travellers: ${t.passengers.map((p) => p.name).join(', ')}',
      'Support: ${phone(t.supportPhone)}',
    ].join('\n');

class _TicketBody extends ConsumerStatefulWidget {
  const _TicketBody({required this.ticket});
  final Ticket ticket;
  @override
  ConsumerState<_TicketBody> createState() => _TicketBodyState();
}

class _TicketBodyState extends ConsumerState<_TicketBody> {
  bool _loadingPreview = false;

  bool get _canCancel {
    final t = widget.ticket;
    return t.status == BookingStatus.confirmed && t.departureAt.isAfter(DateTime.now()) && t.passengers.every((p) => p.status == PassengerStatus.booked);
  }

  Future<void> _cancel() async {
    final t = widget.ticket;
    setState(() => _loadingPreview = true);
    CancelPreview preview;
    try {
      preview = CancelPreview.fromJson(await ref.read(apiProvider).get('/bookings/${t.id}/cancel-preview') as Json);
    } on ApiError catch (e) {
      if (mounted) toast(context, e.message, error: true);
      return;
    } finally {
      if (mounted) setState(() => _loadingPreview = false);
    }
    if (!mounted) return;
    if (!preview.cancellable) {
      toast(context, 'This booking can no longer be cancelled', error: true);
      return;
    }
    final policy = ref.read(configProvider).value?.refundPolicy ?? const <RefundTier>[];
    var busy = false;
    final done = await showPcSheet<bool>(
      context,
      title: 'Cancel this booking?',
      builder: (_) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        PcCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            InfoRow('You paid', inr(t.fare.total)),
            InfoRow('Refund (${preview.refundPercent}%)', inr(preview.refundAmount), strong: true, valueColor: preview.refundAmount > 0 ? context.pc.success : null),
            Txt.caption(preview.tierLabel),
          ]),
        ),
        const SizedBox(height: 12),
        const Txt.small('The refund goes back to the account you paid from, usually within 5 to 7 working days. All seats on this booking are released.'),
        if (policy.isNotEmpty) ...[
          const SizedBox(height: 12),
          const Txt.label('Refund policy'),
          const SizedBox(height: 4),
          for (final p in policy) Txt.small('• ${p.label}'),
        ],
      ]),
      footer: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Btn('Cancel booking', kind: BtnKind.danger, loading: busy, onPressed: () async {
            setSheet(() => busy = true);
            try {
              await ref.read(apiProvider).post('/bookings/${t.id}/cancel', {'reason': 'Cancelled by customer'});
              if (ctx.mounted) Navigator.pop(ctx, true);
            } on ApiError catch (e) {
              setSheet(() => busy = false);
              if (ctx.mounted) toast(ctx, e.message, error: true);
            }
          }),
          const SizedBox(height: 8),
          Btn('Keep booking', kind: BtnKind.ghost, onPressed: busy ? null : () => Navigator.pop(ctx, false)),
        ]),
      ),
    );
    if (done != true) return;
    refreshBookings(ref, bookingId: t.id);
    if (mounted) toast(context, preview.refundAmount > 0 ? 'Booking cancelled. ${inr(preview.refundAmount)} refund started.' : 'Booking cancelled');
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.ticket;
    final c = context.pc;
    final (label, tone) = bookingStatus(t.status);
    final confirmed = t.status == BookingStatus.confirmed || t.status == BookingStatus.completed;
    return PcScreen(
      onRefresh: () async => ref.refresh(ticketProvider(t.id).future).then<void>((_) {}, onError: (_) {}),
      children: [
        // Ticket stub
        Container(
          decoration: BoxDecoration(color: Brand.navy, borderRadius: BorderRadius.circular(14)),
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(t.code, style: const TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.w600, letterSpacing: 0.5))),
              StatusChip(label, tone: tone),
            ]),
            const SizedBox(height: 10),
            RouteTitle(t.from, t.to, big: true, color: Colors.white),
            const SizedBox(height: 4),
            Text('${dayLabel(t.departureAt)} · ${time(t.departureAt)} – ${time(t.arrivalAt)}', style: const TextStyle(color: Colors.white, fontSize: 15)),
          ]),
        ),
        if (t.status == BookingStatus.held)
          PcBanner(
            tone: Tone.warning,
            title: 'Payment not finished',
            body: 'Your seats are held only for a few minutes.',
            action: Btn('Complete payment', compact: true, expand: false, onPressed: () => context.pushReplacement('/pay/${t.id}')),
          ),
        if (t.status == BookingStatus.cancelled && t.refunds.isEmpty) const PcBanner(tone: Tone.neutral, body: 'This booking was cancelled. No payment was refundable.'),
        for (final r in t.refunds)
          PcBanner(
            tone: r.status == 'FAILED' ? Tone.danger : Tone.success,
            title: switch (r.status) { 'PROCESSED' => 'Refunded ${inr(r.amount)}', 'FAILED' => 'Refund delayed', _ => 'Refund of ${inr(r.amount)} started' },
            body: r.status == 'FAILED' ? 'The payment gateway could not process it yet. PrimeCabs support will retry it.' : '${r.percent}% of what you paid, back to the account you paid from.',
          ),
        if (confirmed) ...[
          const Txt.label('Boarding codes'),
          if (t.status == BookingStatus.confirmed) const Txt.small('Tell the driver each traveller\'s code when boarding and again when getting off. Don\'t share them before the trip.'),
          for (final p in t.passengers) _PassengerCode(p),
        ] else if (t.status != BookingStatus.held) ...[
          const Txt.label('Travellers'),
          PcCard(child: Column(children: [for (final p in t.passengers) InfoRow(p.name, '${p.age} · ${_gender(p.gender)}')])),
        ],
        PcCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            _StopRow(icon: Icons.trip_origin, label: 'Pickup in ${t.from}', stop: t.pickup, at: time(t.departureAt)),
            Align(alignment: Alignment.centerLeft, child: Padding(padding: const EdgeInsets.only(left: 11), child: Container(width: 2, height: 16, color: c.border))),
            _StopRow(icon: Icons.place, label: 'Drop in ${t.to}', stop: t.drop, at: 'about ${time(t.arrivalAt)}'),
          ]),
        ),
        if (t.driverName != null)
          PcCard(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                CircleAvatar(backgroundColor: Brand.teal, foregroundColor: Brand.onTeal, child: Text(initials(t.driverName))),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Txt.strong(t.driverName!),
                    Txt.small('Your driver'),
                  ]),
                ),
                if (t.driverPhone != null && t.status == BookingStatus.confirmed)
                  IconButton.filledTonal(tooltip: 'Call driver', onPressed: () => callNumber(t.driverPhone!), icon: const Icon(Icons.call)),
              ]),
              Divider(height: 24, color: c.border),
              InfoRow('Car', t.vehicleName?.isNotEmpty == true ? t.vehicleName! : shortVehicle(t.vehicleType ?? '—')),
              InfoRow('Number plate', t.vehicleNo ?? '—', strong: true),
            ]),
          ),
        FareSummary(fare: t.fare, title: 'Fare'),
        PcCard(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          child: Column(children: [
            ListRow(icon: Icons.support_agent, title: 'Call PrimeCabs support', subtitle: '${phone(t.supportPhone)} · 24 hours', onTap: () => callNumber(t.supportPhone)),
            ListRow(icon: Icons.mail_outline, title: 'Email support', subtitle: t.supportEmail, onTap: () => sendEmail(t.supportEmail)),
          ]),
        ),
        if (t.status == BookingStatus.confirmed)
          Btn('Share ticket', kind: BtnKind.secondary, icon: Icons.ios_share, onPressed: () => SharePlus.instance.share(ShareParams(text: shareText(t), subject: 'PrimeCabs ${t.code}'))),
        if (_canCancel) Btn('Cancel booking', kind: BtnKind.danger, loading: _loadingPreview, onPressed: _cancel),
      ],
    );
  }
}

String _gender(String g) => switch (g) { 'MALE' => 'Male', 'FEMALE' => 'Female', _ => 'Other' };

class _PassengerCode extends StatelessWidget {
  const _PassengerCode(this.p);
  final TicketPassenger p;

  @override
  Widget build(BuildContext context) {
    final c = context.pc;
    final (codeLabel, code) = switch (p.status) {
      PassengerStatus.booked => ('Boarding code', p.startCode),
      PassengerStatus.onboard => ('Drop-off code', p.endCode),
      _ => ('', null),
    };
    final (statusLabel, tone) = switch (p.status) {
      PassengerStatus.booked => ('Not boarded', Tone.neutral),
      PassengerStatus.onboard => ('On board', Tone.info),
      PassengerStatus.dropped => ('Dropped', Tone.success),
      PassengerStatus.noShow => ('No-show', Tone.danger),
    };
    return PcCard(
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Txt.strong(p.name),
            Txt.small('${p.age} · ${_gender(p.gender)}'),
            const SizedBox(height: 6),
            StatusChip(statusLabel, tone: tone),
          ]),
        ),
        if (code != null)
          Semantics(
            label: '$codeLabel ${code.split('').join(' ')}',
            child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Txt.caption(codeLabel),
              const SizedBox(height: 4),
              Row(children: [
                for (final d in code.split(''))
                  Container(
                    width: 34,
                    height: 42,
                    margin: const EdgeInsets.only(left: 4),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: c.primarySoft, borderRadius: BorderRadius.circular(8), border: Border.all(color: Brand.teal)),
                    child: Text(d, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: c.text)),
                  ),
              ]),
            ]),
          ),
      ]),
    );
  }
}

class _StopRow extends StatelessWidget {
  const _StopRow({required this.icon, required this.label, required this.stop, required this.at});
  final IconData icon;
  final String label, at;
  final Stop stop;

  @override
  Widget build(BuildContext context) => Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(icon, size: 24, color: Brand.tealDark),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Txt.caption(label),
            Txt.strong(stop.label),
            if (stop.isHome) const Txt.small('Your address'),
          ]),
        ),
        Txt.small(at),
      ]);
}
