import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:primecabs_core/primecabs_core.dart';
import 'package:primecabs_ui/primecabs_ui.dart';

import '../app_state.dart';
import '../router.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});
  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final _name = TextEditingController(), _age = TextEditingController(), _email = TextEditingController();
  String? _gender, _cityId;
  bool _touched = false, _busy = false, _filled = false;

  @override
  void dispose() {
    for (final c in [_name, _age, _email]) {
      c.dispose();
    }
    super.dispose();
  }

  void _fill(DriverMe me) {
    if (_filled) return;
    _filled = true;
    _name.text = me.name ?? '';
    _age.text = me.age?.toString() ?? '';
    _email.text = me.email ?? '';
    _gender = me.gender;
    _cityId = me.homeCityId;
  }

  Map<String, String?> get _errors {
    final age = int.tryParse(_age.text);
    return {
      'name': _name.text.trim().length < 2 ? 'Enter your full name as on your licence' : null,
      'age': age == null || age < 18 || age > 75 ? 'Enter your age (18 to 75)' : null,
      'gender': _gender == null ? 'Choose one' : null,
      'homeCityId': _cityId == null ? 'Choose the city you drive from' : null,
      'email': _email.text.isNotEmpty && !RegExp(r'^\S+@\S+\.\S+$').hasMatch(_email.text) ? 'Enter a valid email or leave it empty' : null,
    };
  }

  String? _show(String k) => _touched ? _errors[k] : null;

  Future<void> _save() async {
    setState(() => _touched = true);
    if (_errors.values.any((e) => e != null)) return;
    setState(() => _busy = true);
    try {
      await ref.read(apiProvider).put('/driver/me', {
        'name': _name.text.trim(),
        'age': int.parse(_age.text),
        'gender': _gender,
        'homeCityId': _cityId,
        if (_email.text.isNotEmpty) 'email': _email.text.trim(),
      });
      ref.invalidate(meProvider);
      if (!mounted) return;
      toast(context, 'Details saved');
      goBack(context, '/onboarding');
    } on ApiError catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = ref.watch(meProvider).value;
    if (me != null) _fill(me);
    final cities = ref.watch(citiesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Your details')),
      body: PcScreen(
        footer: Btn('Save and continue', loading: _busy, onPressed: _save),
        children: [
          const Txt.small('Use your name exactly as it appears on your driving licence.'),
          PcField(label: 'Full name', controller: _name, error: _show('name'), textCapitalization: TextCapitalization.words, autofillHints: const [AutofillHints.name], onChanged: (_) => setState(() {})),
          PcField(
            label: 'Age',
            controller: _age,
            error: _show('age'),
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(2)],
            onChanged: (_) => setState(() {}),
          ),
          PcChoice<String>(
            label: 'Gender',
            value: _gender,
            error: _show('gender'),
            onChanged: (v) => setState(() => _gender = v),
            options: const [ChoiceOption('MALE', 'Male'), ChoiceOption('FEMALE', 'Female'), ChoiceOption('OTHER', 'Other')],
          ),
          cities.when(
            data: (list) => PcChoice<String>(
              label: 'Home city',
              value: _cityId,
              error: _show('homeCityId'),
              onChanged: (v) => setState(() => _cityId = v),
              options: [for (final c in list) ChoiceOption(c.id, c.name)],
            ),
            loading: () => const Skeleton(height: 48),
            error: (e, _) => ErrorView(message: errorMessage(e), onRetry: () => ref.invalidate(citiesProvider)),
          ),
          PcField(label: 'Email (optional)', controller: _email, error: _show('email'), keyboardType: TextInputType.emailAddress, autofillHints: const [AutofillHints.email], onChanged: (_) => setState(() {})),
        ],
      ),
    );
  }
}
