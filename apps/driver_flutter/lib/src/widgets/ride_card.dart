import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:primecabs_core/primecabs_core.dart';
import 'package:primecabs_ui/primecabs_ui.dart';

(String, Tone) rideStatus(RideStatus s) => switch (s) {
      RideStatus.pendingApproval => ('Fare in review', Tone.warning),
      RideStatus.rejected => ('Not approved', Tone.danger),
      RideStatus.open => ('Live', Tone.success),
      RideStatus.full => ('Full', Tone.info),
      RideStatus.started => ('On trip', Tone.info),
      RideStatus.completed => ('Completed', Tone.neutral),
      RideStatus.cancelled => ('Cancelled', Tone.danger),
    };

String shortVehicle(String type) => type.replaceAll(' or similar 7-seater', '');

class RideCard extends StatelessWidget {
  const RideCard({super.key, required this.ride});
  final DriverRide ride;

  @override
  Widget build(BuildContext context) {
    final c = context.pc;
    final (label, tone) = rideStatus(ride.status);
    final fare = ride.seatFare ?? ride.proposedSeatFare;
    return PcCard(
      onTap: () => context.push('/ride/${ride.id}'),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Flexible(child: Txt.strong(ride.from)),
                Padding(padding: const EdgeInsets.symmetric(horizontal: 6), child: Icon(Icons.arrow_forward, size: 16, color: c.textMuted)),
                Flexible(child: Txt.strong(ride.to)),
              ]),
              const SizedBox(height: 2),
              Txt.small('${dateTime(ride.departureAt)} – ${time(ride.arrivalAt)} · ${shortVehicle(ride.vehicleType)}'),
            ]),
          ),
          const SizedBox(width: 8),
          StatusChip(label, tone: tone),
        ]),
        if (ride.status == RideStatus.rejected && ride.fareDecision?.reason != null) ...[
          const SizedBox(height: 8),
          Txt.small(ride.fareDecision!.reason!, color: c.danger),
        ],
        if (ride.status != RideStatus.cancelled && ride.status != RideStatus.rejected) ...[
          const SizedBox(height: 12),
          SeatBar(sold: ride.seatsSold, total: ride.totalSeats),
          const SizedBox(height: 6),
          Row(children: [
            Expanded(child: Txt.small('${ride.seatsSold} of ${ride.totalSeats} booked')),
            Txt.small('${inr(fare)} / seat${ride.status == RideStatus.pendingApproval ? ' proposed' : ''}'),
          ]),
        ],
      ]),
    );
  }
}
