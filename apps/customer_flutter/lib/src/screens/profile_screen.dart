// Customer details. Name, email, age and gender are all required before booking (form 6.2).
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:primecabs_core/primecabs_core.dart';
import 'package:primecabs_ui/primecabs_ui.dart';

import '../app_state.dart';
import '../router.dart';

final _emailPattern = RegExp(r'^\S+@\S+\.\S+$');
final _namePattern = RegExp(r"^\p{L}[\p{L} .'-]*$", unicode: true);

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key, this.firstTime = false});

  /// Right after sign-up: no back button, and Search opens after saving.
  final bool firstTime;

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final _name = TextEditingController(), _age = TextEditingController(), _email = TextEditingController();
  String? _gender;
  bool _touched = false, _busy = false, _filled = false;

  @override
  void dispose() {
    for (final c in [_name, _age, _email]) {
      c.dispose();
    }
    super.dispose();
  }

  void _fill(CustomerMe me) {
    if (_filled) return;
    _filled = true;
    _name.text = me.name ?? '';
    _age.text = me.age?.toString() ?? '';
    _email.text = me.email ?? '';
    _gender = me.gender;
  }

  Map<String, String?> get _errors {
    final age = int.tryParse(_age.text);
    final name = _name.text.trim();
    return {
      'name': name.length < 2 || !_namePattern.hasMatch(name) ? 'Enter your full name' : null,
      'email': !_emailPattern.hasMatch(_email.text.trim()) ? 'Enter a valid email address' : null,
      'age': age == null || age < 1 || age > 120 ? 'Enter your age' : null,
      'gender': _gender == null ? 'Choose one' : null,
    };
  }

  String? _show(String k) => _touched ? _errors[k] : null;

  Future<void> _save() async {
    setState(() => _touched = true);
    if (_errors.values.any((e) => e != null)) return;
    setState(() => _busy = true);
    try {
      await ref.read(apiProvider).put('/me', {
        'name': _name.text.trim(),
        'email': _email.text.trim(),
        'age': int.parse(_age.text),
        'gender': _gender,
      });
      ref.invalidate(meProvider);
      if (!mounted) return;
      toast(context, 'Details saved');
      widget.firstTime ? context.go('/search') : goBack(context, '/account');
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
    return Scaffold(
      appBar: AppBar(title: Text(widget.firstTime ? 'About you' : 'Your details'), automaticallyImplyLeading: !widget.firstTime),
      body: PcScreen(
        footer: Btn(widget.firstTime ? 'Save and continue' : 'Save', loading: _busy, onPressed: _save),
        children: [
          if (widget.firstTime) const Txt.small('We need these once. Your e-ticket and booking emails use them.'),
          PcField(label: 'Full name', controller: _name, error: _show('name'), textCapitalization: TextCapitalization.words, autofillHints: const [AutofillHints.name], onChanged: (_) => setState(() {})),
          PcField(label: 'Email', controller: _email, error: _show('email'), keyboardType: TextInputType.emailAddress, autofillHints: const [AutofillHints.email], onChanged: (_) => setState(() {})),
          PcField(
            label: 'Age',
            controller: _age,
            error: _show('age'),
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(3)],
            onChanged: (_) => setState(() {}),
          ),
          PcChoice<String>(
            label: 'Gender',
            value: _gender,
            error: _show('gender'),
            onChanged: (v) => setState(() => _gender = v),
            options: const [ChoiceOption('MALE', 'Male'), ChoiceOption('FEMALE', 'Female'), ChoiceOption('OTHER', 'Other')],
          ),
          if (me != null) InfoRow('Mobile number', phone(me.phone)),
        ],
      ),
    );
  }
}
