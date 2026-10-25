import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:primecabs_core/primecabs_core.dart';
import 'package:primecabs_ui/primecabs_ui.dart';

(String, Tone) bookingStatus(BookingStatus s) => switch (s) {
      BookingStatus.held => ('Awaiting payment', Tone.warning),
      BookingStatus.confirmed => ('Confirmed', Tone.success),
      BookingStatus.completed => ('Completed', Tone.neutral),
      BookingStatus.cancelled => ('Cancelled', Tone.danger),
      BookingStatus.expired => ('Not paid', Tone.neutral),
    };

/// "Ertiga or similar 7-seater" -> "Ertiga"
String shortVehicle(String type) => type.replaceAll(' or similar 7-seater', '');

/// "From → To" on one line.
class RouteTitle extends StatelessWidget {
  const RouteTitle(this.from, this.to, {super.key, this.color, this.big = false});
  final String from, to;
  final Color? color;
  final bool big;

  @override
  Widget build(BuildContext context) {
    final c = context.pc;
    Widget t(String s) => big ? Txt.title(s, color: color) : Txt.strong(s, color: color);
    return Row(children: [
      Flexible(child: t(from)),
      Padding(padding: const EdgeInsets.symmetric(horizontal: 6), child: Icon(Icons.arrow_forward, size: big ? 18 : 16, color: color?.withValues(alpha: 0.7) ?? c.textMuted)),
      Flexible(child: t(to)),
    ]);
  }
}

class BookingCard extends StatelessWidget {
  const BookingCard({super.key, required this.booking});
  final BookingSummary booking;

  @override
  Widget build(BuildContext context) {
    final (label, tone) = bookingStatus(booking.status);
    final held = booking.status == BookingStatus.held;
    return PcCard(
      onTap: () => context.push(held ? '/pay/${booking.id}' : '/ticket/${booking.id}'),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              RouteTitle(booking.from, booking.to),
              const SizedBox(height: 2),
              Txt.small(dateTime(booking.departureAt)),
            ]),
          ),
          const SizedBox(width: 8),
          StatusChip(label, tone: tone),
        ]),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(child: Txt.small('${booking.code} · ${booking.seats} seat${booking.seats > 1 ? 's' : ''}')),
          Txt.strong(inr(booking.total)),
        ]),
      ]),
    );
  }
}
