
@implementation OJObject

+ (id) alloc
{
    return $oj.class_createInstance(this);
}

+ (BOOL) instancesRespondToSelector:(SEL)aSelector
{
    return $oj.class_respondsToSelector(this, aSelector);
}

- (id) init { /* Empty */ }


- (id) mutableCopy { [self copyWithZone:nil]; }
- (id) mutableCopyWithZone { }
- (id) copy { [self copyWithZone:nil]; }
- (id) copyWithZone:(id)zone { }

- (id) performSelector:(SEL)aSelector { $oj.msgSend(self, aSelector); }
- (id) performSelector:(SEL)aSelector withObject:(id)object { $oj.msgSend(self, aSelector, object); }
- (id) performSelector:(SEL)aSelector withObject:(id)object1 withObject:(id)object2 { $oj.msgSend(self, aSelector, object1, object2); }

@end
