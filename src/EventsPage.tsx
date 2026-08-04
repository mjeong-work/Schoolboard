import { useState, useMemo } from 'react';
import { NavigationBar } from './components/NavigationBar';
import { EventCard } from './components/EventCard';
import { FloatingActionButton } from './components/FloatingActionButton';
import { CreateEventDialog } from './components/CreateEventDialog';
import { Button } from './components/ui/button';
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs';
import { Calendar } from './components/ui/calendar';
import { Search, X } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { useData } from './utils/dataContext';
import { useAuth } from './utils/authContext';

export default function EventsPage() {
  const { events, addEvent } = useData();
  const { user } = useAuth();
  const [isCreateEventOpen, setIsCreateEventOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState('upcoming');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [calendarView, setCalendarView] = useState<'daily' | 'weekly' | 'monthly'>('weekly');

  // Shared anchor date — drives all three views
  const [anchorDate, setAnchorDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  // Derived: week start for weekly view
  const currentWeekStart = useMemo(() => {
    const d = new Date(anchorDate);
    d.setDate(d.getDate() - d.getDay()); // back to Sunday
    return d;
  }, [anchorDate]);

  const handlePrev = () => {
    setAnchorDate(prev => {
      const d = new Date(prev);
      if (calendarView === 'daily') d.setDate(d.getDate() - 1);
      else if (calendarView === 'weekly') d.setDate(d.getDate() - 7);
      else d.setMonth(d.getMonth() - 1);
      return d;
    });
  };

  const handleNext = () => {
    setAnchorDate(prev => {
      const d = new Date(prev);
      if (calendarView === 'daily') d.setDate(d.getDate() + 1);
      else if (calendarView === 'weekly') d.setDate(d.getDate() + 7);
      else d.setMonth(d.getMonth() + 1);
      return d;
    });
  };

  const handleCreateEvent = async (newEvent: {
    title: string;
    date: string;
    time: string;
    venue: string;
    description: string;
    image?: string;
    category?: string;
    locationName?: string;
    locationAddress?: string;
    locationLat?: number;
    locationLng?: number;
    googlePlaceId?: string;
  }) => {
    try {
      await addEvent({
        title: newEvent.title,
        date: newEvent.date,
        time: newEvent.time,
        venue: newEvent.venue,
        description: newEvent.description,
        image: newEvent.image || '',
        category: newEvent.category,
        locationName: newEvent.locationName,
        locationAddress: newEvent.locationAddress,
        locationLat: newEvent.locationLat,
        locationLng: newEvent.locationLng,
        googlePlaceId: newEvent.googlePlaceId,
      });
      toast.success('Event created successfully!');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create event');
    }
  };

  // Filter events based on tab and selected date
  const filteredAndSortedEvents = useMemo(() => {
    let result = [...events];

    // Apply category filter
    if (selectedCategory !== 'all') {
      result = result.filter((event) =>
        (event.category ?? '').toLowerCase() === selectedCategory.toLowerCase()
      );
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((event) =>
        event.title.toLowerCase().includes(query) ||
        event.description.toLowerCase().includes(query) ||
        event.venue.toLowerCase().includes(query)
      );
    }

    // Apply tab filter — compare date strings directly to avoid UTC-vs-local timezone skew
    const todayStr = new Date().toLocaleDateString('en-CA'); // "YYYY-MM-DD" in local time

    switch (selectedTab) {
      case 'upcoming':
        result = result.filter((event) => event.date >= todayStr);
        result.sort((a, b) => a.date.localeCompare(b.date));
        break;
      case 'rsvp':
        result = result.filter((event) => event.participants.includes(user?.id ?? ''));
        result.sort((a, b) => a.date.localeCompare(b.date));
        break;
      case 'past':
        result = result.filter((event) => event.date < todayStr);
        result.sort((a, b) => b.date.localeCompare(a.date));
        break;
    }

    // Apply date filter if a date is selected
    if (selectedDate) {
      const selectedDateString = selectedDate.toISOString().split('T')[0];
      result = result.filter((event) => event.date === selectedDateString);
    }

    return result;
  }, [events, selectedTab, selectedDate, searchQuery, selectedCategory]);

  // Get dates that have events for calendar highlighting
  const eventDates = useMemo(() => {
    return events.map((event) => new Date(event.date));
  }, [events]);

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
  };

  const clearDateFilter = () => {
    setSelectedDate(undefined);
  };

  // Weekly: 7 days Sun–Sat
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(currentWeekStart);
      d.setDate(currentWeekStart.getDate() + i);
      return d;
    });
  }, [currentWeekStart]);

  // Monthly: all days in the anchor month padded to start on Sunday
  const monthGrid = useMemo(() => {
    const year = anchorDate.getFullYear();
    const month = anchorDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
    return Array.from({ length: totalCells }, (_, i) => {
      const d = new Date(year, month, 1 - startOffset + i);
      return d;
    });
  }, [anchorDate]);

  // Header label changes per view
  const calendarHeaderLabel = useMemo(() => {
    if (calendarView === 'daily') {
      return anchorDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
    if (calendarView === 'weekly') {
      return currentWeekStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    return anchorDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [calendarView, anchorDate, currentWeekStart]);

  return (
    <div className="min-h-screen bg-white">
      <NavigationBar activeTab="events" />
      
      {/* Utility bar — page title now lives in NavigationBar; this row is
          just filter/search controls so it doesn't duplicate that title. */}
      <div className="sticky top-14 bg-white/95 backdrop-blur-sm z-10">
        <div className="max-w-[640px] mx-auto px-4 border-b border-[#f0f0f0]">
          {/* Top Bar */}
          <div className="flex items-center py-3 gap-3">
            {isSearchOpen ? (
              <>
                <div className="flex items-center gap-2 ml-auto">
                  {/* Category filter dropdown */}
                  <div className="relative">
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="appearance-none bg-[#f5f5f5] rounded-full pl-3 pr-7 py-2 text-sm text-black outline-none cursor-pointer hover:bg-[#ebebeb] transition-colors"
                    >
                      <option value="all">All Categories</option>
                      {['Academic', 'Social', 'Career', 'Sports', 'Other'].map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#999]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                  {/* Search bar */}
                  <div className="flex items-center gap-2 bg-[#f5f5f5] rounded-full px-4 py-2">
                    <Search className="w-4 h-4 text-[#999]" strokeWidth={1.5} />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search events..."
                      autoFocus
                      className="w-32 bg-transparent outline-none text-black placeholder:text-[#999] text-sm"
                    />
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsSearchOpen(false);
                    setSearchQuery('');
                  }}
                  className="p-2 hover:bg-black/5 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-black" strokeWidth={1.5} />
                </button>
              </>
            ) : (
              <>
                <button 
                  onClick={() => setIsSearchOpen(true)}
                  className="p-2 hover:bg-black/5 rounded-full transition-colors ml-auto"
                >
                  <Search className="w-5 h-5 text-black" strokeWidth={1.5} />
                </button>
                {/* Hidden on mobile — the floating "+" button already covers
                    event creation there, so this avoided showing two create
                    controls on the same screen. */}
                <Button
                  onClick={() => setIsCreateEventOpen(true)}
                  className="hidden sm:inline-flex bg-black text-white hover:bg-black/90 rounded-full px-4 py-1.5 h-auto text-sm font-[Roboto]"
                >
                  Post
                </Button>
              </>
            )}
          </div>

          {/* Tabs */}
          <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
            <TabsList className="w-full bg-transparent border-0 p-0 h-auto justify-start gap-8">
              <TabsTrigger 
                value="upcoming" 
                className="bg-transparent border-0 rounded-none border-b-2 border-transparent data-[state=active]:border-black data-[state=active]:bg-transparent px-0 pb-3 data-[state=active]:shadow-none"
              >
                Upcoming
              </TabsTrigger>
              <TabsTrigger 
                value="rsvp" 
                className="bg-transparent border-0 rounded-none border-b-2 border-transparent data-[state=active]:border-black data-[state=active]:bg-transparent px-0 pb-3 data-[state=active]:shadow-none"
              >
                My RSVPs
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Events Feed - Threads Style */}
      <main className="max-w-[640px] mx-auto">
        {/* Calendar View */}
        <div className="border-b border-[#f0f0f0] py-5 px-4">
          <div className="w-full max-w-md mx-auto">

            {/* Header row: prev · label · next + view toggle */}
            <div className="flex items-center justify-between mb-4 gap-2">
              <button onClick={handlePrev} className="p-2 hover:bg-black/5 rounded-full transition-colors flex-shrink-0" aria-label="Previous">
                <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              </button>

              <h3 className="text-sm font-semibold text-black font-[Roboto] text-center flex-1 truncate">
                {calendarHeaderLabel}
              </h3>

              <button onClick={handleNext} className="p-2 hover:bg-black/5 rounded-full transition-colors flex-shrink-0" aria-label="Next">
                <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>

              {/* Segmented view toggle */}
              <div className="flex items-center bg-[#f3f4f6] rounded-lg p-0.5 gap-0.5 flex-shrink-0">
                {(['daily', 'weekly', 'monthly'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setCalendarView(v)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                      calendarView === v
                        ? 'bg-white text-black shadow-sm'
                        : 'text-[#666] hover:text-black'
                    }`}
                  >
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* ── DAILY VIEW ── */}
            {calendarView === 'daily' && (() => {
              const ds = anchorDate.toLocaleDateString('en-CA');
              const isSelected = selectedDate?.toLocaleDateString('en-CA') === ds;
              const hasEvent = eventDates.some(d => d.toLocaleDateString('en-CA') === ds);
              const isToday = new Date().toLocaleDateString('en-CA') === ds;
              const dayEvents = events.filter(e => e.date === ds);
              return (
                    <button
                      onClick={() => handleDateSelect(isSelected ? undefined : anchorDate)}
                      className={`w-full flex items-stretch gap-4 px-4 py-4 rounded-2xl border-2 transition-all text-left ${
                        isSelected ? 'bg-black border-black text-white shadow-lg'
                        : isToday ? 'bg-blue-50 border-blue-200 text-black'
                        : 'bg-white border-[#f0f0f0] text-black hover:border-[#ddd] hover:shadow-md'
                      }`}
                    >
                      {/* Left — date block */}
                      <div className="flex flex-col items-center justify-center min-w-[56px]">
                        <span className={`text-[11px] font-semibold uppercase tracking-wide ${isSelected ? 'text-white/60' : 'text-[#999]'}`}>
                          {anchorDate.toLocaleDateString('en-US', { weekday: 'short' })}
                        </span>
                        <span className={`text-5xl font-bold leading-none ${isSelected ? 'text-white' : hasEvent ? 'text-[#6366f1]' : 'text-black'}`}>
                          {anchorDate.getDate()}
                        </span>
                        <span className={`text-[10px] mt-0.5 ${isSelected ? 'text-white/50' : 'text-[#bbb]'}`}>
                          {anchorDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                        </span>
                      </div>

                      {/* Divider */}
                      <div className={`w-px self-stretch ${isSelected ? 'bg-white/20' : 'bg-[#f0f0f0]'}`} />

                      {/* Right — event summary */}
                      <div className="flex-1 flex flex-col justify-center gap-1.5 min-w-0">
                        {dayEvents.length === 0 ? (
                          <span className={`text-sm ${isSelected ? 'text-white/50' : 'text-[#bbb]'}`}>No events today</span>
                        ) : (
                          <>
                            <span className={`text-[11px] font-semibold ${isSelected ? 'text-white/60' : 'text-[#6366f1]'}`}>
                              {dayEvents.length} event{dayEvents.length > 1 ? 's' : ''}
                            </span>
                            {dayEvents.slice(0, 3).map(ev => (
                              <div key={ev.id} className="flex items-baseline gap-1.5 min-w-0">
                                <span className={`text-[10px] shrink-0 font-medium ${isSelected ? 'text-white/50' : 'text-[#999]'}`}>{ev.time.split('–')[0].split('-')[0].trim()}</span>
                                <span className={`text-xs font-medium truncate ${isSelected ? 'text-white' : 'text-black'}`}>{ev.title}</span>
                              </div>
                            ))}
                            {dayEvents.length > 3 && (
                              <span className={`text-[10px] ${isSelected ? 'text-white/40' : 'text-[#bbb]'}`}>+{dayEvents.length - 3} more</span>
                            )}
                          </>
                        )}
                      </div>
                    </button>
              );
            })()}

            {/* ── WEEKLY VIEW ── */}
            {calendarView === 'weekly' && (
              <div className="grid grid-cols-7 gap-1.5">
                {weekDays.map((date) => {
                  const ds = date.toLocaleDateString('en-CA');
                  const isSelected = selectedDate?.toLocaleDateString('en-CA') === ds;
                  const hasEvent = eventDates.some(d => d.toLocaleDateString('en-CA') === ds);
                  const isToday = new Date().toLocaleDateString('en-CA') === ds;
                  const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
                  return (
                    <button
                      key={ds}
                      onClick={() => handleDateSelect(isSelected ? undefined : date)}
                      className={`flex flex-col items-center justify-center py-3 rounded-xl border-2 transition-all ${
                        isSelected ? 'bg-black border-black text-white shadow-lg'
                        : isToday ? 'bg-blue-50 border-blue-200 text-black'
                        : 'bg-white border-[#f0f0f0] text-black hover:border-[#ddd] hover:shadow-md'
                      }`}
                    >
                      <span className={`text-[10px] mb-1 ${isSelected ? 'text-white/70' : 'text-[#999]'}`}>{dayName}</span>
                      <span className={`text-lg font-semibold leading-none ${isSelected ? 'text-white' : hasEvent ? 'text-[#6366f1]' : 'text-black'}`}>
                        {date.getDate()}
                      </span>
                      {hasEvent && <div className={`w-1 h-1 rounded-full mt-1 ${isSelected ? 'bg-white' : 'bg-[#6366f1]'}`} />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── MONTHLY VIEW ── */}
            {calendarView === 'monthly' && (() => {
              const currentMonth = anchorDate.getMonth();
              const dayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
              return (
                <div>
                  {/* Day-of-week headers */}
                  <div className="grid grid-cols-7 mb-1">
                    {dayLabels.map(d => (
                      <div key={d} className="text-center text-[10px] font-semibold text-[#bbb] py-1">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-y-1">
                    {monthGrid.map((date) => {
                      const ds = date.toLocaleDateString('en-CA');
                      const isCurrentMonth = date.getMonth() === currentMonth;
                      const isSelected = selectedDate?.toLocaleDateString('en-CA') === ds;
                      const hasEvent = isCurrentMonth && eventDates.some(d => d.toLocaleDateString('en-CA') === ds);
                      const now = new Date();
                      const isTodayExact =
                        date.getFullYear() === now.getFullYear() &&
                        date.getMonth() === now.getMonth() &&
                        date.getDate() === now.getDate();
                      return (
                            <button
                              key={ds}
                              onClick={() => isCurrentMonth && handleDateSelect(isSelected ? undefined : date)}
                              disabled={!isCurrentMonth}
                              className={`relative flex flex-col items-center justify-center py-1 rounded-lg transition-all ${
                                !isCurrentMonth ? 'opacity-20 cursor-default' : 'hover:bg-[#f5f5f5]'
                              }`}
                            >
                              <span className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-medium transition-all ${
                                isSelected
                                  ? 'bg-black text-white'
                                  : isTodayExact
                                  ? 'bg-[#6366f1] text-white'
                                  : 'text-black'
                              }`}>
                                {date.getDate()}
                              </span>
                              <div className="h-3 flex items-center justify-center mt-0.5">
                                {isTodayExact && !isSelected ? (
                                  <span className="text-[8px] font-semibold text-[#6366f1] leading-none">Today</span>
                                ) : hasEvent ? (
                                  <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-[#6366f1]'}`} />
                                ) : null}
                              </div>
                            </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

          </div>

          {/* Selected date label */}
          {selectedDate && (
            <div className="mt-4 text-center">
              <p className="text-sm text-[#666] mb-1">
                Showing events for{' '}
                <span className="font-semibold text-black">
                  {selectedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </span>
              </p>
              <button onClick={clearDateFilter} className="text-sm text-[#6366f1] hover:text-[#4f46e5] font-medium transition-colors">
                Show all
              </button>
            </div>
          )}
        </div>

        {/* Events List */}
        {filteredAndSortedEvents.length > 0 ? (
          <div>
            {filteredAndSortedEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 px-4">
            <p className="text-[#999] text-sm mb-1">No events found</p>
            <p className="text-xs text-[#999]">
              {selectedDate 
                ? 'No events scheduled for this date' 
                : selectedTab === 'rsvp' 
                  ? 'RSVP to your first event' 
                  : 'Be the first to create an event'}
            </p>
          </div>
        )}
      </main>

      {/* Create Event Dialog */}
      <CreateEventDialog 
        open={isCreateEventOpen}
        onOpenChange={setIsCreateEventOpen}
        onSubmit={handleCreateEvent}
      />

      {/* Mobile Floating Action Button */}
      <FloatingActionButton onClick={() => setIsCreateEventOpen(true)} />
    </div>
  );
}