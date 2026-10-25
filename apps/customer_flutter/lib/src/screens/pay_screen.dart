// Payment while the seats are held: countdown, price, and the gateway checkout.
// With the test gateway (PAYMENT_PROVIDER=fake) a test checkout sheet stands in for Razorpay.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:primecabs_core/primecabs_core.dart';
import 'package:primecabs_ui/primecabs_ui.dart';

import '../app_state.dart';
import '../router.dart';
import '../widgets/booking_card.dart';
import '../widgets/fare_summary.dart';

class PayScreen extends ConsumerStatefulWidget {
  const PayScreen({super.key, required this.bookingId});
  final String bookingId;
  @override
  ConsumerState<PayScreen> createState() => _PayScreenState();
}

class _PayScreenState extends ConsumerState<PayScreen> {
  Timer? _tick;
  bool _paying = false, _releasing = false;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  Future<void> _pay(Ticket t) async {
    setState(() => _paying = true);
    final api = ref.read(apiProvider);
    try {
      final order = PaymentOrder.fromJson(await api.post('/bookings/${t.id}/pay', {}) as Json);
      if (!order.isTest) {
        // Razorpay checkout needs the account's keys and its SDK; neither is set up yet.
        if (mounted) toast(context, 'Online payment is not switched on yet. Please try again later.', error: true);
        return;
      }
      if (!mounted) return;
      final ok = await _testCheckout(order);
      if (ok != true) return;
      final proof = await api.post('/payments/fake-checkout', {'bookingId': t.id, 'orderId': order.orderId}) as Json;
      final r = await api.post('/payments/verify', {'bookingId': t.id, ...proof}) as Json;
      refreshBookings(ref, bookingId: t.id);
      if (!mounted) return;
      if (r['outcome'] == 'REFUNDED_SEATS_GONE') {
        await showPcSheet<void>(
          context,
          title: 'Seats no longer available',
          builder: (_) => const Txt.body('Your payment arrived after the hold ended and the seats were taken. The full amount is being refunded.'),
          footer: (ctx) => Btn('OK', onPressed: () => Navigator.pop(ctx)),
        );
        if (mounted) context.go('/bookings');
        return;
      }
      toast(context, 'Payment received. Booking confirmed.');
      context.pushReplacement('/ticket/${t.id}');
    } on ApiError catch (e) {
      if (!mounted) return;
      toast(context, e.message, error: true);
      if (e.code == 'HOLD_EXPIRED' || e.code == 'NOT_PAYABLE') refreshBookings(ref, bookingId: t.id);
    } finally {
      if (mounted) setState(() => _paying = false);
    }
  }

  Future<bool?> _testCheckout(PaymentOrder order) => showPcSheet<bool>(
        context,
        title: 'Test payment',
        builder: (_) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const PcBanner(tone: Tone.warning, title: 'Test mode', body: 'No money moves. In the live app, Razorpay opens here for UPI or card.'),
          const SizedBox(height: 12),
          InfoRow('Booking', order.bookingCode),
          InfoRow('Amount', inr(order.amount), strong: true),
        ]),
        footer: (ctx) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Btn('Pay ${inr(order.amount)}', icon: Icons.lock_outline, onPressed: () => Navigator.pop(ctx, true)),
          const SizedBox(height: 8),
          Btn('Cancel', kind: BtnKind.ghost, onPressed: () => Navigator.pop(ctx, false)),
        ]),
      );

  Future<void> _release(Ticket t) async {
    setState(() => _releasing = true);
    try {
      await ref.read(apiProvider).post('/bookings/${t.id}/cancel', {'reason': 'Released before payment'});
      refreshBookings(ref, bookingId: t.id);
      if (!mounted) return;
      toast(context, 'Seats released');
      goBack(context, '/search');
    } on ApiError catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _releasing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ticket = ref.watch(ticketProvider(widget.bookingId));
    return Scaffold(
      appBar: AppBar(title: const Text('Payment')),
      body: ticket.when(
        loading: () => const PcScreen(children: [Skeleton(height: 120, radius: 14), Skeleton(height: 160, radius: 14)]),
        error: (e, _) => PcScreen(children: [ErrorView(message: errorMessage(e), onRetry: () => ref.invalidate(ticketProvider(widget.bookingId)))]),
        data: (t) {
          if (t.status != BookingStatus.held) {
            // Paid elsewhere (or released): show the ticket instead.
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted) context.pushReplacement('/ticket/${t.id}');
            });
            return const SizedBox.shrink();
          }
          final left = t.holdExpiresAt == null ? 0 : t.holdExpiresAt!.difference(DateTime.now()).inSeconds;
          if (left <= 0) {
            return PcScreen(children: [
              const EmptyView(icon: Icons.timer_off_outlined, title: "Time's up", body: 'Your seats were released because payment was not completed in time. You were not charged.'),
              Btn('Search again', onPressed: () => context.go('/search')),
            ]);
          }
          final urgent = left <= 60;
          return PcScreen(
            footer: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Btn('Pay ${inr(t.fare.total)}', icon: Icons.lock_outline, loading: _paying, onPressed: _releasing ? null : () => _pay(t)),
              const SizedBox(height: 4),
              Btn('Cancel and release seats', kind: BtnKind.ghost, loading: _releasing, onPressed: _paying ? null : () => _release(t)),
            ]),
            children: [
              _HoldTimer(secondsLeft: left, urgent: urgent),
              PcCard(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  RouteTitle(t.from, t.to, big: true),
                  const SizedBox(height: 4),
                  Txt.small('${dateTime(t.departureAt)} – ${time(t.arrivalAt)}'),
                  const SizedBox(height: 8),
                  InfoRow('Pickup', t.pickup.label),
                  InfoRow('Drop', t.drop.label),
                  InfoRow('Travellers', t.passengers.map((p) => p.name.split(' ').first).join(', ')),
                  InfoRow('Booking', t.code),
                ]),
              ),
              FareSummary(fare: t.fare),
            ],
          );
        },
      ),
    );
  }
}

class _HoldTimer extends StatelessWidget {
  const _HoldTimer({required this.secondsLeft, required this.urgent});
  final int secondsLeft;
  final bool urgent;

  @override
  Widget build(BuildContext context) {
    final c = context.pc;
    final fg = urgent ? c.danger : c.warning;
    return Semantics(
      liveRegion: secondsLeft % 30 == 0,
      label: 'Seats held for ${countdown(secondsLeft)} more',
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: urgent ? c.dangerBg : c.warningBg, borderRadius: BorderRadius.circular(14)),
        child: Row(children: [
          Icon(Icons.timer_outlined, color: fg, size: 28),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Txt.strong('Seats held for you', color: fg),
              Txt.small('Pay before the timer ends or the seats go back on sale.', color: fg),
            ]),
          ),
          Text(countdown(secondsLeft), style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: fg, fontFeatures: const [FontFeature.tabularFigures()])),
        ]),
      ),
    );
  }
}
