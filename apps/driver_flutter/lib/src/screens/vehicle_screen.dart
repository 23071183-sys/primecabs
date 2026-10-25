// Add a vehicle, or edit one (?id=). Editing sends the vehicle back for review.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:primecabs_core/primecabs_core.dart';
import 'package:primecabs_ui/primecabs_ui.dart';

import '../app_state.dart';
import '../router.dart';

class VehicleScreen extends ConsumerStatefulWidget {
  const VehicleScreen({super.key, this.vehicleId});
  final String? vehicleId;
  @override
  ConsumerState<VehicleScreen> createState() => _VehicleScreenState();
}

class _VehicleScreenState extends ConsumerState<VehicleScreen> {
  final _reg = TextEditingController(), _make = TextEditingController(), _model = TextEditingController(), _year = TextEditingController(), _colour = TextEditingController();
  String? _typeId;
  bool? _yellow;
  bool _touched = false, _busy = false, _filled = false;
  final _thisYear = DateTime.now().year;

  @override
  void dispose() {
    for (final c in [_reg, _make, _model, _year, _colour]) {
      c.dispose();
    }
    super.dispose();
  }

  Vehicle? _existing(DriverMe? me) => me?.vehicles.where((v) => v.id == widget.vehicleId).firstOrNull;

  void _fill(Vehicle v) {
    if (_filled) return;
    _filled = true;
    _typeId = v.typeId;
    _reg.text = v.registrationNo;
    _make.text = v.make;
    _model.text = v.model;
    _year.text = '${v.year}';
    _colour.text = v.colour;
    _yellow = v.yellowPlate;
  }

  Map<String, String?> get _errors {
    final y = int.tryParse(_year.text);
    return {
      'vehicleTypeId': _typeId == null ? 'Choose your vehicle type' : null,
      'registrationNo': vehicleRegPattern.hasMatch(normalizeReg(_reg.text)) ? null : 'Enter the number as on your RC, for example MH31AB1234',
      'make': _make.text.trim().length < 2 ? 'Enter the company, for example Maruti Suzuki' : null,
      'model': _model.text.trim().isEmpty ? 'Enter the model, for example Ertiga' : null,
      'year': y == null || y < _thisYear - 20 || y > _thisYear + 1 ? 'Enter a year between ${_thisYear - 20} and $_thisYear' : null,
      'colour': _colour.text.trim().length < 3 ? 'Enter the colour' : null,
      'plateType': _yellow == null ? 'Choose the number plate colour' : null,
    };
  }

  Future<void> _save(Vehicle? existing) async {
    setState(() => _touched = true);
    if (_errors.values.any((e) => e != null)) return;
    setState(() => _busy = true);
    final body = {
      'vehicleTypeId': _typeId,
      'registrationNo': normalizeReg(_reg.text),
      'make': _make.text.trim(),
      'model': _model.text.trim(),
      'year': int.parse(_year.text),
      'colour': _colour.text.trim(),
      'plateType': _yellow! ? 'YELLOW' : 'WHITE',
    };
    try {
      final api = ref.read(apiProvider);
      existing == null ? await api.post('/driver/vehicles', body) : await api.put('/driver/vehicles/${existing.id}', body);
      ref.invalidate(meProvider);
      if (!mounted) return;
      toast(context, existing == null ? 'Vehicle added. Now upload its documents.' : 'Vehicle updated');
      existing == null ? context.pushReplacement('/onboarding/documents') : goBack(context, '/onboarding');
    } on ApiError catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final existing = _existing(ref.watch(meProvider).value);
    if (existing != null) _fill(existing);
    final types = ref.watch(vehicleTypesProvider);
    String? show(String k) => _touched ? _errors[k] : null;
    void touch(_) => setState(() {});

    return Scaffold(
      appBar: AppBar(title: Text(existing == null ? 'Your vehicle' : 'Edit vehicle')),
      body: PcScreen(
        footer: Btn(existing == null ? 'Add vehicle' : 'Save changes', loading: _busy, onPressed: () => _save(existing)),
        children: [
          if (existing != null) const PcBanner(tone: Tone.warning, body: 'Changing vehicle details sends it back to PrimeCabs for review before you can publish rides with it.'),
          types.when(
            data: (list) => PcChoice<String>(
              label: 'Vehicle type',
              value: _typeId,
              error: show('vehicleTypeId'),
              onChanged: (v) => setState(() => _typeId = v),
              options: [for (final t in list) ChoiceOption(t.id, t.name.replaceAll(' or similar 7-seater', ''), hint: '${t.passengerSeats} passengers')],
            ),
            loading: () => const Skeleton(height: 96),
            error: (e, _) => ErrorView(message: errorMessage(e), onRetry: () => ref.invalidate(vehicleTypesProvider)),
          ),
          PcField(
            label: 'Vehicle number',
            controller: _reg,
            placeholder: 'MH31AB1234',
            error: show('registrationNo'),
            textCapitalization: TextCapitalization.characters,
            inputFormatters: [_UpperCase()],
            onChanged: touch,
          ),
          PcField(label: 'Company', controller: _make, placeholder: 'Maruti Suzuki', error: show('make'), textCapitalization: TextCapitalization.words, onChanged: touch),
          PcField(label: 'Model', controller: _model, placeholder: 'Ertiga', error: show('model'), textCapitalization: TextCapitalization.words, onChanged: touch),
          PcField(
            label: 'Year',
            controller: _year,
            placeholder: '${_thisYear - 2}',
            error: show('year'),
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(4)],
            onChanged: touch,
          ),
          PcField(label: 'Colour', controller: _colour, placeholder: 'White', error: show('colour'), textCapitalization: TextCapitalization.words, onChanged: touch),
          PcChoice<bool>(
            label: 'Number plate',
            value: _yellow,
            error: show('plateType'),
            onChanged: (v) => setState(() => _yellow = v),
            options: const [ChoiceOption(true, 'Yellow plate', hint: 'Commercial / taxi'), ChoiceOption(false, 'White plate', hint: 'Private car')],
          ),
          if (_yellow == true) const Txt.small("Yellow-plate vehicles need a TR (transport) licence. You'll upload it in the next step."),
        ],
      ),
    );
  }
}

class _UpperCase extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) => newValue.copyWith(text: newValue.text.toUpperCase());
}
