// Review and book: seats, pickup and drop, each traveller's details, and the price from the server.
// "Continue" holds the seats (5 minutes by default) and opens the payment screen.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:primecabs_core/primecabs_core.dart';
import 'package:primecabs_ui/primecabs_ui.dart';

import '../app_state.dart';
import '../widgets/booking_card.dart';
import '../widgets/fare_summary.dart';

/// Pickup or drop choice: a fixed point, or a home address where the town allows it.
class StopChoice {
  const StopChoice.point(this.pointId) : address = null;
  const StopChoice.home([this.address = '']) : pointId = null;
  final String? pointId;
  final String? address;
  bool get isHome => pointId == null;

  /// Body for the API, or null while a home address is too short to send.
  Json? toJson() => isHome ? ((address ?? '').trim().length >= 10 ? {'address': address!.trim()} : null) : {'pointId': pointId};
}

class _Traveller {
  final name = TextEditingController(), phone = TextEditingController(), age = TextEditingController();
  String? gender;
  void dispose() {
    name.dispose();
    phone.dispose();
    age.dispose();
  }
}

class BookScreen extends ConsumerStatefulWidget {
  const BookScreen({super.key, required this.rideId, required this.seats});
  final String rideId;
  final int seats;

  @override
  ConsumerState<BookScreen> createState() => _BookScreenState();
}

class _BookScreenState extends ConsumerState<BookScreen> {
  int? _seats;
  StopChoice? _pickup, _drop;
  final _pickupAddress = TextEditingController(), _dropAddress = TextEditingController();
  final List<_Traveller> _travellers = [];
  bool _touched = false, _busy = false, _prefilled = false;

  Fare? _fare;
  String? _quoteError;
  bool _quoting = false;
  Timer? _debounce;
  int _quoteSeq = 0;

  @override
  void dispose() {
    _debounce?.cancel();
    _pickupAddress.dispose();
    _dropAddress.dispose();
    for (final t in _travellers) {
      t.dispose();
    }
    super.dispose();
  }

  void _setup(BookableRide ride, CustomerMe? me) {
    if (_seats == null) {
      _seats = widget.seats.clamp(1, ride.availableSeats < 1 ? 1 : ride.availableSeats);
      // Hubs have fixed points only, so start with the first (usually free) one.
      if (ride.from.pickupPoints.isNotEmpty) _pickup = StopChoice.point(ride.from.pickupPoints.first.id);
      if (ride.to.pickupPoints.isNotEmpty) _drop = StopChoice.point(ride.to.pickupPoints.first.id);
      _resizeTravellers();
      WidgetsBinding.instance.addPostFrameCallback((_) => _requestQuote());
    }
    // The first traveller is usually the customer.
    if (!_prefilled && me != null && _travellers.isNotEmpty) {
      _prefilled = true;
      final t = _travellers.first;
      t.name.text = me.name ?? '';
      t.phone.text = me.phone.replaceFirst('+91', '');
      t.age.text = me.age?.toString() ?? '';
      t.gender = me.gender;
    }
  }

  void _resizeTravellers() {
    while (_travellers.length < _seats!) {
      _travellers.add(_Traveller());
    }
    while (_travellers.length > _seats!) {
      _travellers.removeLast().dispose();
    }
  }

  void _requestQuote() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), _quote);
  }

  Future<void> _quote() async {
    final pickup = _pickup?.toJson(), drop = _drop?.toJson();
    if (pickup == null || drop == null || _seats == null) {
      setState(() => _fare = null);
      return;
    }
    final seq = ++_quoteSeq;
    setState(() => _quoting = true);
    try {
      final r = await ref.read(apiProvider).post('/bookings/quote', {'rideId': widget.rideId, 'seats': _seats, 'pickup': pickup, 'drop': drop}) as Json;
      if (!mounted || seq != _quoteSeq) return;
      setState(() {
        _fare = Fare.fromJson(r['fare'] as Json);
        _quoteError = null;
      });
    } on ApiError catch (e) {
      if (!mounted || seq != _quoteSeq) return;
      setState(() {
        _fare = null;
        _quoteError = e.message;
      });
      if (e.code == 'SEATS_UNAVAILABLE' || e.code == 'RIDE_NOT_AVAILABLE') ref.invalidate(rideProvider(widget.rideId));
    } finally {
      if (mounted && seq == _quoteSeq) setState(() => _quoting = false);
    }
  }

  /// The problem with one traveller field. Shown only after the first Continue, unless [always].
  String? _travellerError(_Traveller t, String field, {bool always = false}) {
    if (!_touched && !always) return null;
    switch (field) {
      case 'name':
        return t.name.text.trim().length < 2 ? 'Enter the full name' : null;
      case 'phone':
        return !isIndianMobile(t.phone.text) ? 'Enter a 10-digit mobile number' : null;
      case 'age':
        final a = int.tryParse(t.age.text);
        return a == null || a < 1 || a > 120 ? 'Enter age' : null;
      default:
        return t.gender == null ? 'Choose one' : null;
    }
  }

  bool get _valid =>
      _pickup?.toJson() != null &&
      _drop?.toJson() != null &&
      _travellers.every((t) => ['name', 'phone', 'age', 'gender'].every((f) => _travellerError(t, f, always: true) == null));

  Future<void> _continue(CustomerMe? me) async {
    setState(() => _touched = true);
    if (me != null && !me.profileComplete) {
      context.push('/profile');
      return;
    }
    if (!_valid) {
      toast(context, 'Check the highlighted details', error: true);
      return;
    }
    setState(() => _busy = true);
    try {
      final r = await ref.read(apiProvider).post('/bookings', {
        'rideId': widget.rideId,
        'seats': _seats,
        'pickup': _pickup!.toJson(),
        'drop': _drop!.toJson(),
        'passengers': [
          for (final t in _travellers) {'name': t.name.text.trim(), 'phone': t.phone.text, 'age': int.parse(t.age.text), 'gender': t.gender},
        ],
      }) as Json;
      final hold = BookingHold.fromJson(r);
      refreshBookings(ref);
      if (mounted) context.pushReplacement('/pay/${hold.id}');
    } on ApiError catch (e) {
      if (!mounted) return;
      toast(context, e.message, error: true);
      if (e.code == 'PROFILE_INCOMPLETE') context.push('/profile');
      if (e.code == 'SEATS_UNAVAILABLE' || e.code == 'RIDE_NOT_AVAILABLE' || e.code == 'BOOKING_CLOSED') ref.invalidate(rideProvider(widget.rideId));
      if (e.code == 'TOO_MANY_HOLDS') context.go('/bookings');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final rideAsync = ref.watch(rideProvider(widget.rideId));
    final me = ref.watch(meProvider).value;
    final config = ref.watch(configProvider).value;
    return Scaffold(
      appBar: AppBar(title: const Text('Review your booking')),
      body: rideAsync.when(
        loading: () => const PcScreen(children: [Skeleton(height: 96, radius: 14), Skeleton(height: 160, radius: 14), Skeleton(height: 220, radius: 14)]),
        error: (e, _) => PcScreen(children: [
          ErrorView(message: errorMessage(e), onRetry: () => ref.invalidate(rideProvider(widget.rideId))),
          Btn('Back to results', kind: BtnKind.secondary, onPressed: () => context.pop()),
        ]),
        data: (ride) {
          _setup(ride, me);
          if (ride.availableSeats == 0) {
            return PcScreen(children: [
              const EmptyView(icon: Icons.event_busy_outlined, title: 'This ride just filled up', body: 'Go back and choose another ride.'),
              Btn('Back to results', kind: BtnKind.secondary, onPressed: () => context.pop()),
            ]);
          }
          final seats = _seats!;
          return PcScreen(
            footer: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Txt.caption('Your seats are held for ${config?.seatHoldMinutes ?? 5} minutes while you pay.', align: TextAlign.center),
              const SizedBox(height: 8),
              Btn(_fare == null ? 'Continue' : 'Continue · ${inr(_fare!.total)}', loading: _busy, onPressed: () => _continue(me)),
            ]),
            children: [
              PcCard(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  RouteTitle(ride.from.name, ride.to.name, big: true),
                  const SizedBox(height: 4),
                  Txt.small('${dateTime(ride.departureAt)} – ${time(ride.arrivalAt)}'),
                  Txt.small('${shortVehicle(ride.vehicleType)} · driver ${ride.driverFirstName} · ${inr(ride.seatFare)} per seat'),
                ]),
              ),
              if (me != null && !me.profileComplete)
                PcBanner(
                  tone: Tone.warning,
                  title: 'Add your details first',
                  body: 'We need your name, email, age and gender once before your first booking.',
                  action: Btn('Add details', compact: true, expand: false, onPressed: () => context.push('/profile')),
                ),
              PcStepper(
                label: 'Seats',
                value: seats,
                min: 1,
                max: ride.availableSeats,
                hint: '${ride.availableSeats} of ${ride.totalSeats} seats free',
                onChanged: (v) => setState(() {
                  _seats = v;
                  _resizeTravellers();
                  _requestQuote();
                }),
              ),
              _StopPicker(
                title: 'Pickup in ${ride.from.name}',
                city: ride.from,
                value: _pickup,
                address: _pickupAddress,
                error: _touched && _pickup?.toJson() == null,
                onChanged: (v) => setState(() {
                  _pickup = v;
                  _requestQuote();
                }),
              ),
              _StopPicker(
                title: 'Drop in ${ride.to.name}',
                city: ride.to,
                value: _drop,
                address: _dropAddress,
                error: _touched && _drop?.toJson() == null,
                onChanged: (v) => setState(() {
                  _drop = v;
                  _requestQuote();
                }),
              ),
              const Txt.label('Travellers'),
              for (var i = 0; i < _travellers.length; i++) _travellerCard(i),
              const Txt.label('Price'),
              if (_quoteError != null)
                PcBanner(tone: Tone.danger, body: _quoteError!)
              else if (_fare == null)
                _quoting ? const Skeleton(height: 120, radius: 14) : const Txt.small('Choose pickup and drop to see the price.')
              else
                AnimatedOpacity(opacity: _quoting ? 0.5 : 1, duration: const Duration(milliseconds: 150), child: FareSummary(fare: _fare!)),
            ],
          );
        },
      ),
    );
  }

  Widget _travellerCard(int i) {
    final t = _travellers[i];
    return PcCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Txt.strong(i == 0 ? 'Traveller 1 (usually you)' : 'Traveller ${i + 1}'),
        const SizedBox(height: 12),
        PcField(label: 'Full name', controller: t.name, error: _travellerError(t, 'name'), textCapitalization: TextCapitalization.words, onChanged: (_) => setState(() {})),
        const SizedBox(height: 12),
        PcField(
          label: 'Mobile number',
          controller: t.phone,
          prefix: '+91',
          error: _travellerError(t, 'phone'),
          keyboardType: TextInputType.phone,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(10)],
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 12),
        PcField(
          label: 'Age',
          controller: t.age,
          error: _travellerError(t, 'age'),
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(3)],
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 12),
        PcChoice<String>(
          label: 'Gender',
          value: t.gender,
          error: _travellerError(t, 'gender'),
          onChanged: (v) => setState(() => t.gender = v),
          options: const [ChoiceOption('MALE', 'Male'), ChoiceOption('FEMALE', 'Female'), ChoiceOption('OTHER', 'Other')],
        ),
      ]),
    );
  }
}

/// Fixed points with their extra charge, plus home pickup or drop where the town offers it.
class _StopPicker extends StatelessWidget {
  const _StopPicker({required this.title, required this.city, required this.value, required this.address, required this.onChanged, required this.error});
  final String title;
  final City city;
  final StopChoice? value;
  final TextEditingController address;
  final ValueChanged<StopChoice> onChanged;
  final bool error;

  String _extra(int paise) => paise == 0 ? 'Free' : '+${inr(paise)}';

  @override
  Widget build(BuildContext context) {
    final c = context.pc;
    Widget option({required bool selected, required String label, required String trailing, required VoidCallback onTap, IconData icon = Icons.place_outlined}) => InkWell(
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: tapTarget + 4),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              child: Row(children: [
                Icon(selected ? Icons.radio_button_checked : Icons.radio_button_off, color: selected ? Brand.teal : c.textMuted, size: 22),
                const SizedBox(width: 12),
                Icon(icon, size: 18, color: c.textSecondary),
                const SizedBox(width: 8),
                Expanded(child: Text(label, style: TextStyle(fontSize: 15, fontWeight: selected ? FontWeight.w600 : FontWeight.w400, color: c.text))),
                Txt.small(trailing, color: trailing == 'Free' ? c.success : null),
              ]),
            ),
          ),
        );
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      FieldLabel(title),
      Container(
        decoration: BoxDecoration(
          color: c.card,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: error ? c.danger : c.border),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(children: [
          for (final p in city.pickupPoints) ...[
            option(
              selected: value?.pointId == p.id,
              label: p.name,
              trailing: _extra(p.extraFare),
              icon: switch (p.kind) { 'RAILWAY' => Icons.train_outlined, 'BUS_STAND' => Icons.directions_bus_outlined, 'AIRPORT' => Icons.flight_outlined, _ => Icons.place_outlined },
              onTap: () => onChanged(StopChoice.point(p.id)),
            ),
            Divider(height: 1, color: c.border),
          ],
          if (city.homePickupAllowed)
            option(
              selected: value?.isHome ?? false,
              label: 'My address',
              trailing: _extra(city.homePickupFee),
              icon: Icons.home_outlined,
              onTap: () => onChanged(StopChoice.home(address.text)),
            ),
          if (value?.isHome ?? false)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
              child: PcField(
                label: 'Full address',
                controller: address,
                placeholder: 'House, street, area',
                maxLines: 2,
                hint: 'Within ${city.name} town limits.',
                error: error ? 'Enter the full address (at least 10 characters)' : null,
                onChanged: (v) => onChanged(StopChoice.home(v)),
              ),
            ),
        ]),
      ),
    ]);
  }
}
