import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:primecabs_core/primecabs_core.dart';
import 'package:primecabs_ui/primecabs_ui.dart';

import '../app_state.dart';
import '../widgets/ride_card.dart';

class TripsScreen extends ConsumerStatefulWidget {
  const TripsScreen({super.key});
  @override
  ConsumerState<TripsScreen> createState() => _TripsScreenState();
}

class _TripsScreenState extends ConsumerState<TripsScreen> {
  String _scope = 'upcoming';

  @override
  Widget build(BuildContext context) {
    final rides = ref.watch(ridesProvider(_scope));
    return Scaffold(
      appBar: AppBar(title: const Text('Trips')),
      body: PcScreen(
        onRefresh: () async => ref.refresh(ridesProvider(_scope).future),
        children: [
          PcChoice<String>(
            value: _scope,
            onChanged: (v) => setState(() => _scope = v),
            options: const [ChoiceOption('upcoming', 'Upcoming'), ChoiceOption('past', 'Past')],
          ),
          ...rides.when(
            loading: () => [for (var i = 0; i < 3; i++) const Skeleton(height: 110, radius: 14)],
            error: (e, _) => [ErrorView(message: errorMessage(e), onRetry: () => ref.invalidate(ridesProvider(_scope)))],
            data: (list) => list.isEmpty
                ? [
                    EmptyView(
                      icon: Icons.event_outlined,
                      title: _scope == 'upcoming' ? 'No upcoming trips' : 'No past trips yet',
                      body: _scope == 'upcoming' ? 'Rides you publish show up here.' : 'Completed and cancelled rides show up here.',
                    ),
                  ]
                : [for (final r in list) RideCard(ride: r)],
          ),
        ],
      ),
    );
  }
}
