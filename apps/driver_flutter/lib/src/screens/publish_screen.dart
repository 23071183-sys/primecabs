// Publish a ride, or edit one (?edit=<rideId>). The driver proposes the fare; PrimeCabs approves it.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:primecabs_core/primecabs_core.dart';
import 'package:primecabs_ui/primecabs_ui.dart';

import '../app_state.dart';
import '../router.dart';

/// Values copied into the form, e.g. for the return trip.
class PublishPrefill {
  const PublishPrefill({required this.routeId, required this.vehicleId, required this.departureAt, required this.seats, required this.seatFare});
  final String routeId, vehicleId;
  final DateTime departureAt;
  final int seats, seatFare;
}

class PublishScreen extends ConsumerStatefulWidget {
  const PublishScreen({super.key, this.prefill, this.editRideId});
  final PublishPrefill? prefill;
  final String? editRideId;
  @override
  ConsumerState<PublishScreen> createState() => _PublishScreenState();
}

class _PublishScreenState extends ConsumerState<PublishScreen> {
  String? _routeId, _vehicleId, _date, _minute;
  int? _hour;
  int _seats = 0;
  final _fare = TextEditingController(), _notes = TextEditingController();
  int? _debouncedFare;
  Timer? _debounce;
  bool _touched = false, _busy = false, _filledEdit = false;
  String? _apiError;

  @override
  void initState() {
    super.initState();
    final p = widget.prefill;
    if (p != null) _applyTimes(p.routeId, p.vehicleId, p.departureAt, p.seats, p.seatFare, roundUpMinutes: true);
  }

  void _applyTimes(String routeId, String vehicleId, DateTime at, int seats, int fare, {String notes = '', bool roundUpMinutes = false}) {
    final ist = utcToIst(at);
    _routeId = routeId;
    _vehicleId = vehicleId;
    _date = ist.date;
    _hour = int.parse(ist.time.substring(0, 2));
    final m = int.parse(ist.time.substring(3));
    _minute = roundUpMinutes ? departureMinutes.firstWhere((x) => int.parse(x) >= m, orElse: () => '45') : ist.time.substring(3);
    _seats = seats;
    _fare.text = fare % 100 == 0 ? '${fare ~/ 100}' : (fare / 100).toStringAsFixed(2);
    _debouncedFare = fare;
    _notes.text = notes;
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _fare.dispose();
    _notes.dispose();
    super.dispose();
  }

  void _onFareChanged(String v) {
    setState(() {});
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () => setState(() => _debouncedFare = paiseFromInput(v)));
  }

  Future<void> _save(Departure dep) async {
    setState(() => _touched = true);
    final fare = paiseFromInput(_fare.text);
    if (_routeId == null || _vehicleId == null || dep is! DepartureOk || fare == null || fare < 5000) return;
    setState(() {
      _busy = true;
      _apiError = null;
    });
    final api = ref.read(apiProvider);
    try {
      final body = {
        'departureAt': dep.at.toIso8601String(),
        'totalSeats': _seats,
        'seatFare': fare,
        if (_notes.text.trim().isNotEmpty) 'notes': _notes.text.trim(),
      };
      if (widget.editRideId != null) {
        await api.put('/driver/rides/${widget.editRideId}', body);
        refreshRides(ref, rideId: widget.editRideId);
        if (!mounted) return;
        toast(context, 'Ride updated. A fare change goes back for review.');
        goBack(context, '/home');
        return;
      }
      final r = await api.post('/driver/rides', {...body, 'routeId': _routeId, 'vehicleId': _vehicleId}) as Json;
      refreshRides(ref);
      if (!mounted) return;
      toast(context, 'Ride sent to PrimeCabs for fare approval');
      final s = r['returnSuggestion'] == null ? null : ReturnSuggestion.fromJson(r['returnSuggestion'] as Json);
      if (s == null) {
        goBack(context, '/home');
      } else {
        await _offerReturn(s);
      }
    } on ApiError catch (e) {
      setState(() => _apiError = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// 2.5: offer to publish the return journey with the form copied and the route reversed.
  Future<void> _offerReturn(ReturnSuggestion s) async {
    final yes = await showPcSheet<bool>(
      context,
      title: 'Publish the return trip?',
      builder: (_) => const Txt.body("Fill your car on the way back too. We'll copy the details and reverse the route; pick the time you'll leave."),
      footer: (ctx) => Column(mainAxisSize: MainAxisSize.min, children: [
        Btn('Yes, set up return trip', icon: Icons.swap_horiz, onPressed: () => Navigator.of(ctx).pop(true)),
        const SizedBox(height: 6),
        Btn('Not now', kind: BtnKind.ghost, onPressed: () => Navigator.of(ctx).pop(false)),
      ]),
    );
    if (!mounted) return;
    if (yes == true) {
      context.pushReplacement('/publish', extra: PublishPrefill(routeId: s.routeId, vehicleId: s.vehicleId, departureAt: s.earliestDepartureAt, seats: s.totalSeats, seatFare: s.seatFare));
    } else {
      goBack(context, '/home');
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pc;
    final me = ref.watch(meProvider).value;
    final routes = ref.watch(routesProvider).value;
    final cities = ref.watch(citiesProvider).value;
    final config = ref.watch(configProvider).value;
    final editing = widget.editRideId == null ? null : ref.watch(rideProvider(widget.editRideId!));
    final vehicles = me?.approvedVehicles ?? const <Vehicle>[];

    if (editing?.value != null && !_filledEdit) {
      final r = editing!.value!;
      _filledEdit = true;
      _applyTimes(r.routeId, r.vehicleId, r.departureAt, r.totalSeats, r.seatFare ?? r.proposedSeatFare, notes: r.notes ?? '');
    }
    if (_vehicleId == null && vehicles.length == 1) _vehicleId = vehicles.first.id;
    final vehicle = vehicles.where((v) => v.id == _vehicleId).firstOrNull;
    final capacity = vehicle?.passengerSeats ?? 0;
    if (capacity > 0 && (_seats == 0 || _seats > capacity)) _seats = capacity;

    final loading = me == null || routes == null || cities == null || (editing != null && editing.value == null);
    if (loading) {
      return Scaffold(appBar: AppBar(title: const Text('Publish a ride')), body: PcScreen(children: [for (var i = 0; i < 4; i++) const Skeleton(height: 64)]));
    }
    if (vehicles.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Publish a ride')),
        body: const PcScreen(children: [PcBanner(tone: Tone.warning, title: 'No approved vehicle', body: 'You can publish once PrimeCabs approves your vehicle.')]),
      );
    }

    String cityName(String id) => cities.where((x) => x.id == id).firstOrNull?.name ?? '…';
    final route = routes.where((r) => r.id == _routeId).firstOrNull;
    final days = nextDays((config?.bookingHorizonDays ?? 30).clamp(1, 30));
    final dep = departureFrom(_date, _hour, _minute, now: DateTime.now(), cutoffMinutes: config?.bookingCutoffMinutes ?? 15);
    final fare = paiseFromInput(_fare.text);
    final errors = {
      'route': _routeId == null ? 'Choose your route' : null,
      'vehicle': _vehicleId == null ? 'Choose a vehicle' : null,
      'when': dep is DepartureError ? dep.message : null,
      'fare': fare == null || fare < 5000 ? 'Enter a fare per seat of at least ₹50' : (fare > 100000 ? 'That fare looks too high' : null),
    };
    String? show(String k) => _touched ? errors[k] : null;
    final ref0 = _routeId != null && _vehicleId != null ? ref.watch(referenceFareProvider((routeId: _routeId!, vehicleId: _vehicleId!, seatFare: _debouncedFare))) : null;
    final refFare = ref0?.value;
    final est = refFare?.perSeat;
    final arrival = dep is DepartureOk && route != null ? dep.at.add(Duration(minutes: route.durationMinutes)) : null;

    return Scaffold(
      appBar: AppBar(title: Text(widget.editRideId == null ? 'Publish a ride' : 'Edit ride')),
      body: PcScreen(
        footer: Btn(widget.editRideId == null ? 'Send for approval' : 'Save changes', icon: Icons.send, loading: _busy, onPressed: () => _save(dep)),
        children: [
          PcChoice<String>(
            label: 'Route',
            value: _routeId,
            error: show('route'),
            onChanged: (v) => widget.editRideId == null ? setState(() => _routeId = v) : null,
            options: [
              for (final r in widget.editRideId == null ? routes : routes.where((r) => r.id == _routeId))
                ChoiceOption(r.id, '${cityName(r.fromCityId)} → ${cityName(r.toCityId)}', hint: '${r.distanceKm} km · ${duration(r.durationMinutes)}'),
            ],
          ),
          if (vehicles.length > 1 && widget.editRideId == null)
            PcChoice<String>(
              label: 'Vehicle',
              value: _vehicleId,
              error: show('vehicle'),
              onChanged: (v) => setState(() => _vehicleId = v),
              options: [for (final v in vehicles) ChoiceOption(v.id, '${v.make} ${v.model}', hint: v.registrationNo)],
            ),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const FieldLabel('Date'),
            SizedBox(
              height: 78,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: days.length,
                separatorBuilder: (_, _) => const SizedBox(width: 8),
                itemBuilder: (_, i) {
                  final d = days[i];
                  final on = d.date == _date;
                  return Semantics(
                    selected: on,
                    button: true,
                    label: '${d.weekday} ${d.day} ${d.month}',
                    child: InkWell(
                      borderRadius: BorderRadius.circular(12),
                      onTap: () => setState(() => _date = d.date),
                      child: Container(
                        width: 62,
                        decoration: BoxDecoration(
                          color: on ? Brand.navy : c.card,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: on ? Brand.navy : c.borderStrong),
                        ),
                        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                          Txt.caption(d.weekday, color: on ? Colors.white70 : c.textSecondary),
                          Txt.title('${d.day}', color: on ? Colors.white : c.text),
                          Txt.caption(d.month, color: on ? Colors.white70 : c.textMuted),
                        ]),
                      ),
                    ),
                  );
                },
              ),
            ),
          ]),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const FieldLabel('Departure time'),
            LayoutBuilder(builder: (context, box) {
              final w = (box.maxWidth - 3 * 6) / 4;
              return Wrap(spacing: 6, runSpacing: 6, children: [
                for (final h in departureHours)
                  SizedBox(
                    width: w,
                    height: 44,
                    child: Semantics(
                      selected: h == _hour,
                      button: true,
                      child: Material(
                        color: h == _hour ? c.primarySoft : c.card,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10), side: BorderSide(color: h == _hour ? Brand.teal : c.border, width: h == _hour ? 1.5 : 1)),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(10),
                          onTap: () => setState(() {
                            _hour = h;
                            _minute ??= '00';
                          }),
                          child: Center(child: h == _hour ? Txt.strong(hourLabel(h)) : Txt.body(hourLabel(h))),
                        ),
                      ),
                    ),
                  ),
              ]);
            }),
            const SizedBox(height: 8),
            PcChoice<String>(value: _minute, onChanged: (v) => setState(() => _minute = v), options: [for (final m in departureMinutes) ChoiceOption(m, ':$m')]),
            const SizedBox(height: 6),
            if (show('when') != null)
              Txt.small(errors['when']!, color: c.danger)
            else if (arrival != null && dep is DepartureOk)
              Txt.small('Leaves ${time(dep.at)}, arrives about ${time(arrival)}'),
          ]),
          if (vehicle != null)
            PcStepper(label: 'Seats for passengers', value: _seats, min: 1, max: capacity, onChanged: (v) => setState(() => _seats = v), hint: 'Your ${vehicle.model} can take up to $capacity.'),
          PcField(
            label: 'Fare per seat',
            controller: _fare,
            prefix: '₹',
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[\d.]'))],
            placeholder: refFare?.referenceSeatFare != null ? '${refFare!.referenceSeatFare! ~/ 100}' : '550',
            error: show('fare'),
            hint: refFare?.referenceSeatFare != null
                ? 'PrimeCabs reference for this route: ${inr(refFare!.referenceSeatFare)}. Fares near it are approved faster.'
                : 'PrimeCabs reviews every fare before customers see the ride.',
            onChanged: _onFareChanged,
          ),
          if (est != null && fare != null)
            PcCard(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Txt.label('Per seat'),
                const SizedBox(height: 4),
                InfoRow('Customer pays (GST included)', inr(est.customerPays)),
                InfoRow('GST', '− ${inr(est.gst)}'),
                InfoRow('PrimeCabs fee (${est.commissionPercent.toStringAsFixed(est.commissionPercent % 1 == 0 ? 0 : 1)}%)', '− ${inr(est.commission)}'),
                const Divider(),
                InfoRow('You get', inr(est.driverEarns), strong: true, valueColor: c.success),
                InfoRow('If all $_seats seats sell, about', inr(est.driverEarns * _seats)),
              ]),
            ),
          PcField(label: 'Note for passengers (optional)', controller: _notes, placeholder: 'For example: AC car, one bag per person', maxLength: 300, maxLines: 3),
          if (_apiError != null) PcBanner(tone: Tone.danger, body: _apiError!),
        ],
      ),
    );
  }
}
