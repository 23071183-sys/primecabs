import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:primecabs_core/primecabs_core.dart';
import 'package:primecabs_ui/primecabs_ui.dart';

import '../app_state.dart';
import '../widgets/booking_card.dart';

class BookingsScreen extends ConsumerStatefulWidget {
  const BookingsScreen({super.key});
  @override
  ConsumerState<BookingsScreen> createState() => _BookingsScreenState();
}

class _BookingsScreenState extends ConsumerState<BookingsScreen> {
  String _tab = 'upcoming';

  @override
  Widget build(BuildContext context) {
    final list = ref.watch(bookingsProvider(_tab));
    return Scaffold(
      appBar: AppBar(title: const Text('Bookings')),
      body: PcScreen(
        onRefresh: () async => ref.refresh(bookingsProvider(_tab).future).then<void>((_) {}, onError: (_) {}),
        children: [
          PcChoice<String>(
            value: _tab,
            onChanged: (v) => setState(() => _tab = v),
            options: const [ChoiceOption('upcoming', 'Upcoming'), ChoiceOption('past', 'Past'), ChoiceOption('cancelled', 'Cancelled')],
          ),
          ...list.when(
            loading: () => [for (var i = 0; i < 3; i++) const Skeleton(height: 96, radius: 14)],
            error: (e, _) => [ErrorView(message: errorMessage(e), onRetry: () => ref.invalidate(bookingsProvider(_tab)))],
            data: (items) => items.isEmpty
                ? [
                    EmptyView(
                      icon: Icons.confirmation_number_outlined,
                      title: switch (_tab) { 'upcoming' => 'No upcoming trips', 'past' => 'No past trips yet', _ => 'No cancelled bookings' },
                      body: _tab == 'upcoming' ? 'Book a seat and your e-ticket will be here.' : null,
                      action: _tab == 'upcoming' ? Btn('Search rides', expand: false, onPressed: () => context.go('/search')) : null,
                    ),
                  ]
                : [for (final b in items) BookingCard(booking: b)],
          ),
        ],
      ),
    );
  }
}
