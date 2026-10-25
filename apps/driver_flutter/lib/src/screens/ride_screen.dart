// One ride: status, fare, passengers, and trip day (board and drop each passenger with their code).
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:primecabs_core/primecabs_core.dart';
import 'package:primecabs_ui/primecabs_ui.dart';

import '../app_state.dart';
import '../widgets/call.dart';
import '../widgets/ride_card.dart';

const _boardingOpensMinutes = 120;

class RideScreen extends ConsumerStatefulWidget {
  const RideScreen({super.key, required this.rideId});
  final String rideId;
  @override
  ConsumerState<RideScreen> createState() => _RideScreenState();
}

class _RideScreenState extends ConsumerState<RideScreen> {
  Timer? _poll;
  String? _busyPassenger;
  bool _completing = false;

  @override
  void initState() {
    super.initState();
    // New bookings and boardings show up without pulling to refresh.
    _poll = Timer.periodic(const Duration(seconds: 30), (_) => ref.invalidate(rideProvider(widget.rideId)));
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  void _refresh() => refreshRides(ref, rideId: widget.rideId);

  Future<void> _codeSheet(Passenger p, {required bool start}) async {
    final result = await showPcSheet<Json>(
      context,
      title: '${start ? 'Board' : 'Drop'} ${p.name}',
      builder: (_) => _CodeSheet(rideId: widget.rideId, passenger: p, start: start),
    );
    if (result == null || !mounted) return;
    _refresh();
    toast(context, result['rideCompleted'] == true ? 'Trip complete. Well done!' : (start ? '${p.name} is on board' : '${p.name} dropped'));
  }

  Future<void> _noShow(Passenger p) async {
    setState(() => _busyPassenger = p.id);
    try {
      await ref.read(apiProvider).post('/driver/rides/${widget.rideId}/passengers/${p.id}/no-show');
      _refresh();
      if (mounted) toast(context, '${p.name} marked as no-show');
    } on ApiError catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _busyPassenger = null);
    }
  }

  Future<void> _complete() async {
    setState(() => _completing = true);
    try {
      await ref.read(apiProvider).post('/driver/rides/${widget.rideId}/complete');
      _refresh();
      if (mounted) toast(context, 'Trip complete');
    } on ApiError catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _completing = false);
    }
  }

  Future<void> _cancel(RideDetail r) async {
    final done = await showPcSheet<int>(context, title: 'Cancel this ride?', builder: (_) => _CancelSheet(ride: r));
    if (done == null || !mounted) return;
    _refresh();
    toast(context, done > 0 ? 'Ride cancelled. $done booking(s) refunded in full.' : 'Ride cancelled');
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pc;
    final rideAsync = ref.watch(rideProvider(widget.rideId));
    return Scaffold(
      appBar: AppBar(title: Text(rideAsync.value == null ? 'Ride' : '${rideAsync.value!.from} → ${rideAsync.value!.to}')),
      body: rideAsync.when(
        loading: () => PcScreen(children: [for (var i = 0; i < 3; i++) const Skeleton(height: 100, radius: 14)]),
        error: (e, _) => ErrorView(message: errorMessage(e), onRetry: () => ref.invalidate(rideProvider(widget.rideId))),
        data: (r) {
          final (label, tone) = rideStatus(r.status);
          final now = DateTime.now();
          final boardingOpen = !now.isBefore(r.departureAt.subtract(const Duration(minutes: _boardingOpensMinutes)));
          final departed = !now.isBefore(r.departureAt);
          final active = {RideStatus.open, RideStatus.full, RideStatus.started}.contains(r.status);
          final onboard = r.passengers.where((p) => p.status == PassengerStatus.onboard).length;
          final handled = r.passengers.where((p) => p.status == PassengerStatus.dropped || p.status == PassengerStatus.noShow).length;
          final editable = {RideStatus.pendingApproval, RideStatus.rejected, RideStatus.open}.contains(r.status) && r.passengers.isEmpty;
          final cancellable = {RideStatus.pendingApproval, RideStatus.rejected, RideStatus.open, RideStatus.full}.contains(r.status);
          final canEnd = active && departed && r.passengers.every((p) => p.status == PassengerStatus.dropped || p.status == PassengerStatus.noShow);

          return PcScreen(
            onRefresh: () async => ref.refresh(rideProvider(widget.rideId).future),
            children: [
              PcCard(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Txt.title(dateTime(r.departureAt)),
                        Txt.small('Arrives about ${time(r.arrivalAt)} · ${shortVehicle(r.vehicleType)} ${r.registrationNo}'),
                      ]),
                    ),
                    const SizedBox(width: 8),
                    StatusChip(label, tone: tone),
                  ]),
                  const SizedBox(height: 16),
                  SeatBar(sold: r.seatsBooked, total: r.totalSeats),
                  const SizedBox(height: 6),
                  Row(children: [
                    Expanded(child: Txt.small('${r.seatsBooked} of ${r.totalSeats} seats booked')),
                    Txt.small('${inr(r.seatFare ?? r.proposedSeatFare)} / seat'),
                  ]),
                  if (r.earnings > 0) InfoRow('You earn from these bookings', inr(r.earnings), strong: true, valueColor: c.success),
                ]),
              ),
              if (r.status == RideStatus.pendingApproval)
                PcBanner(tone: Tone.warning, title: 'Waiting for fare approval', body: "PrimeCabs is reviewing your fare of ${inr(r.proposedSeatFare)} per seat. Customers can book once it's approved."),
              if (r.status == RideStatus.rejected)
                PcBanner(tone: Tone.danger, title: 'Not approved', body: "${r.fareDecision?.reason ?? "PrimeCabs didn't approve this ride."} Edit the ride to send it again."),
              if (r.status == RideStatus.open && r.fareDecision?.decision == 'CHANGED' && r.fareDecision?.approvedFare != null)
                PcBanner(
                  title: 'Fare changed by PrimeCabs',
                  body: "You proposed ${inr(r.proposedSeatFare)}; it was approved at ${inr(r.fareDecision!.approvedFare)} per seat. Cancel the ride if that doesn't work for you.",
                ),
              if (r.status == RideStatus.cancelled) PcBanner(tone: Tone.danger, title: 'Cancelled', body: r.cancelReason ?? 'This ride was cancelled.'),
              if (active && r.passengers.isNotEmpty)
                PcCard(
                  color: c.primarySoft,
                  highlight: true,
                  child: Row(children: [
                    Icon(Icons.groups, color: c.accentText),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Txt.strong('$onboard on board · $handled done · ${r.passengers.length - onboard - handled} waiting'),
                        Txt.small(boardingOpen ? 'Ask each passenger for the 4-digit code on their ticket.' : 'Boarding opens ${_boardingOpensMinutes ~/ 60} hours before departure.'),
                      ]),
                    ),
                  ]),
                ),
              const Txt.label('Passengers'),
              if (r.passengers.isEmpty)
                PcCard(
                  child: EmptyView(
                    icon: Icons.people_outline,
                    title: 'No bookings yet',
                    body: r.status == RideStatus.open ? 'Customers can book now. Bookings appear here as they come in.' : null,
                  ),
                )
              else
                for (final p in r.passengers)
                  PcCard(
                    highlight: p.status == PassengerStatus.booked && boardingOpen && active,
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      Row(children: [
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Txt.strong(p.name),
                            Txt.small('${p.gender == 'FEMALE' ? 'F' : (p.gender == 'MALE' ? 'M' : 'O')} · ${p.age} · ${p.bookingCode}'),
                          ]),
                        ),
                        StatusChip(
                          switch (p.status) { PassengerStatus.booked => 'Waiting', PassengerStatus.onboard => 'On board', PassengerStatus.dropped => 'Dropped', PassengerStatus.noShow => 'No-show' },
                          tone: switch (p.status) { PassengerStatus.booked => Tone.neutral, PassengerStatus.onboard => Tone.info, PassengerStatus.dropped => Tone.success, PassengerStatus.noShow => Tone.danger },
                        ),
                        IconButton(tooltip: 'Call ${p.name}', icon: Icon(Icons.call, color: c.accentText), onPressed: () => callNumber(p.phone)),
                      ]),
                      const SizedBox(height: 6),
                      if (p.pickup != null) Txt.small('Pickup: ${p.pickup}'),
                      if (p.drop != null) Txt.small('Drop: ${p.drop}'),
                      Txt.caption(phone(p.phone)),
                      if (active && p.status == PassengerStatus.booked && boardingOpen) ...[
                        const SizedBox(height: 12),
                        Btn('Board with code', compact: true, icon: Icons.login, onPressed: () => _codeSheet(p, start: true)),
                        if (departed) ...[
                          const SizedBox(height: 8),
                          Btn('Mark as no-show', compact: true, kind: BtnKind.secondary, loading: _busyPassenger == p.id, onPressed: () => _noShow(p)),
                        ],
                      ],
                      if (active && p.status == PassengerStatus.onboard) ...[
                        const SizedBox(height: 12),
                        Btn('Drop with code', compact: true, icon: Icons.flag_outlined, onPressed: () => _codeSheet(p, start: false)),
                      ],
                    ]),
                  ),
              if (canEnd) Btn('End trip', icon: Icons.done_all, loading: _completing, onPressed: _complete),
              if (editable) Btn('Edit ride', kind: BtnKind.secondary, icon: Icons.edit_outlined, onPressed: () => context.push('/publish?edit=${r.id}')),
              if (cancellable) Btn('Cancel ride', kind: BtnKind.danger, icon: Icons.cancel_outlined, onPressed: () => _cancel(r)),
            ],
          );
        },
      ),
    );
  }
}

class _CodeSheet extends ConsumerStatefulWidget {
  const _CodeSheet({required this.rideId, required this.passenger, required this.start});
  final String rideId;
  final Passenger passenger;
  final bool start;
  @override
  ConsumerState<_CodeSheet> createState() => _CodeSheetState();
}

class _CodeSheetState extends ConsumerState<_CodeSheet> {
  final _code = TextEditingController();
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_code.text.length != 4 || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final r = await ref.read(apiProvider).post('/driver/rides/${widget.rideId}/passengers/${widget.passenger.id}/${widget.start ? 'start' : 'end'}', {'otp': _code.text}) as Json;
      if (mounted) Navigator.of(context).pop(r);
    } on ApiError catch (e) {
      _code.clear();
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pc;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Txt.body('Ask ${widget.passenger.name.split(' ').first} for the ${widget.start ? 'boarding' : 'drop'} code on their e-ticket.'),
      const SizedBox(height: 16),
      CodeInput(length: 4, controller: _code, error: _error != null, onChanged: (_) => setState(() => _error = null), onCompleted: (_) => _submit()),
      if (_error != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(_error!, textAlign: TextAlign.center, style: TextStyle(color: c.danger, fontSize: 13))),
      const SizedBox(height: 16),
      ListenableBuilder(
        listenable: _code,
        builder: (_, _) => Btn(widget.start ? 'Confirm boarding' : 'Confirm drop', loading: _busy, onPressed: _code.text.length == 4 ? _submit : null),
      ),
    ]);
  }
}

class _CancelSheet extends ConsumerStatefulWidget {
  const _CancelSheet({required this.ride});
  final RideDetail ride;
  @override
  ConsumerState<_CancelSheet> createState() => _CancelSheetState();
}

class _CancelSheetState extends ConsumerState<_CancelSheet> {
  final _reason = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final r = await ref.read(apiProvider).post('/driver/rides/${widget.ride.id}/cancel', {'reason': _reason.text.trim()}) as Json;
      if (mounted) Navigator.of(context).pop(r['bookingsCancelled'] as int? ?? 0);
    } on ApiError catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final booked = widget.ride.passengers.length;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (booked > 0)
        PcBanner(tone: Tone.warning, body: "$booked passenger(s) have booked. They'll be refunded in full and told the ride is cancelled. Repeated cancellations can lead to a fine.")
      else
        const Txt.body('No one has booked yet.'),
      const SizedBox(height: 16),
      PcField(label: 'Reason', controller: _reason, placeholder: 'For example: car needs repair', maxLength: 300, maxLines: 3, onChanged: (_) => setState(() {})),
      if (_error != null) ...[const SizedBox(height: 10), PcBanner(tone: Tone.danger, body: _error!)],
      const SizedBox(height: 16),
      Btn('Cancel ride', kind: BtnKind.danger, loading: _busy, onPressed: _reason.text.trim().length >= 3 ? _submit : null),
      const SizedBox(height: 6),
      Btn('Keep ride', kind: BtnKind.ghost, onPressed: () => Navigator.of(context).pop()),
    ]);
  }
}
