useEffect(() => {
  let active = true;

  async function loadJourneyUnreadCount() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!active || !user) {
      if (active) setJourneyUnreadCount(0);
      return;
    }

    const { count, error } = await supabase
      .from("inbox_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("read", false)
      .is("hidden_at", null);

    if (!active || error) return;

    setJourneyUnreadCount(count ?? 0);
  }

  void loadJourneyUnreadCount();

  const interval = window.setInterval(() => {
    void loadJourneyUnreadCount();
  }, 30000);

  return () => {
    active = false;
    window.clearInterval(interval);
  };
}, []);
