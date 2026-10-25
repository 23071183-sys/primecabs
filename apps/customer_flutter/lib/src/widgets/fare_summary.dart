import 'package:flutter/material.dart';
import 'package:primecabs_core/primecabs_core.dart';
import 'package:primecabs_ui/primecabs_ui.dart';

/// Fare breakup (form 6.5): seats, pickup and drop extras, GST and the total.
class FareSummary extends StatelessWidget {
  const FareSummary({super.key, required this.fare, this.title});
  final Fare fare;
  final String? title;

  @override
  Widget build(BuildContext context) {
    final c = context.pc;
    final gst = fare.gstRatePercent % 1 == 0 ? fare.gstRatePercent.toInt() : fare.gstRatePercent;
    return PcCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (title != null) ...[Txt.strong(title!), const SizedBox(height: 4)],
        InfoRow('${inr(fare.seatFare)} × ${fare.seats} seat${fare.seats > 1 ? 's' : ''}', inr(fare.seatsAmount)),
        if (fare.pickupExtra > 0) InfoRow('Pickup charge', inr(fare.pickupExtra)),
        if (fare.dropExtra > 0) InfoRow('Drop charge', inr(fare.dropExtra)),
        if (!fare.gstIncluded) InfoRow('GST ($gst%)', inr(fare.gstAmount)),
        Divider(height: 16, color: c.border),
        InfoRow('Total', inr(fare.total), strong: true),
        if (fare.gstIncluded) Txt.caption('Includes ${inr(fare.gstAmount)} GST ($gst%)', align: TextAlign.right),
      ]),
    );
  }
}
